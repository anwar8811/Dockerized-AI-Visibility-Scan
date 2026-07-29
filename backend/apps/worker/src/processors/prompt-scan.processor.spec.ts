import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prompt, Scan, PromptResult, ScanPromptStatus } from '@app/common';
import { PromptScanProcessor } from './prompt-scan.processor';

describe('PromptScanProcessor', () => {
  const scanId = 'scan-1';
  const promptId = 'prompt-1';

  function buildProcessor(options: {
    queryResult: { processedPrompts: number; totalPrompts: number };
    findOneResult?: unknown;
  }) {
    const prompt = { id: promptId, text: 'What CRM should I use?' };
    const scan = { id: scanId, brandName: 'NimbusCRM', competitors: ['OrbitDesk'] };

    const promptRepository = {
      findOneByOrFail: jest.fn().mockResolvedValue(prompt),
      update: jest.fn(),
    };
    const scanRepository = {
      findOneByOrFail: jest.fn().mockResolvedValue(scan),
      update: jest.fn(),
    };

    const manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(),
      update: jest.fn(),
      // Mirrors what the real pg driver returns for an UPDATE ... RETURNING
      // via manager.query(): a [rows, affectedRowCount] tuple, not the rows
      // array directly - this is exactly the shape bug a live E2E run caught.
      query: jest.fn().mockResolvedValue([[options.queryResult], 1]),
      findOne: jest.fn().mockResolvedValue(options.findOneResult),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) => callback(manager)),
    };

    const analysis = {
      brandMentioned: true,
      brandMentionCount: 2,
      competitorsMentioned: ['OrbitDesk'],
      citationDomains: ['reviews.test'],
    };
    const openRouterService = { generate: jest.fn().mockResolvedValue('NimbusCRM is great.') };
    const analyzerClientService = { analyze: jest.fn().mockResolvedValue(analysis) };
    const visibilityScoringService = {
      computeAggregates: jest.fn().mockReturnValue({
        visibilityScore: 60,
        competitorMentions: { OrbitDesk: 3 },
        topCompetitor: 'OrbitDesk',
        citationDomains: ['reviews.test'],
      }),
    };

    const processor = new PromptScanProcessor(
      promptRepository as any,
      scanRepository as any,
      dataSource as any,
      openRouterService as any,
      analyzerClientService as any,
      visibilityScoringService as any,
    );

    return {
      processor,
      prompt,
      scan,
      promptRepository,
      scanRepository,
      manager,
      dataSource,
      openRouterService,
      analyzerClientService,
      analysis,
      visibilityScoringService,
    };
  }

  it('runs steps 2-6: calls OpenRouter, calls the analyzer, then persists the result in one transaction', async () => {
    const {
      processor,
      prompt,
      scan,
      promptRepository,
      scanRepository,
      manager,
      dataSource,
      openRouterService,
      analyzerClientService,
      analysis,
    } = buildProcessor({ queryResult: { processedPrompts: 1, totalPrompts: 3 } });

    const job = { id: 'job-1', data: { scanId, promptId } } as Job<{
      scanId: string;
      promptId: string;
    }>;

    await processor.process(job);

    expect(promptRepository.update).toHaveBeenCalledWith(promptId, {
      status: ScanPromptStatus.PROCESSING,
    });
    expect(scanRepository.update).toHaveBeenCalledWith(scanId, {
      status: ScanPromptStatus.PROCESSING,
    });

    expect(openRouterService.generate).toHaveBeenCalledWith(prompt.text);
    expect(analyzerClientService.analyze).toHaveBeenCalledWith({
      brand: scan.brandName,
      competitors: scan.competitors,
      response: 'NimbusCRM is great.',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.create).toHaveBeenCalledWith(PromptResult, {
      promptId,
      aiResponse: 'NimbusCRM is great.',
      brandMentioned: analysis.brandMentioned,
      brandMentionCount: analysis.brandMentionCount,
      competitorsMentioned: analysis.competitorsMentioned,
      citationDomains: analysis.citationDomains,
    });
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(Prompt, promptId, {
      status: ScanPromptStatus.COMPLETED,
    });

    // The atomic increment-and-read happened...
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('RETURNING'), [scanId]);
    // ...but since processedPrompts (1) !== totalPrompts (3), the scan is
    // NOT marked complete, and no scoring/aggregate query ever runs.
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalledWith(
      Scan,
      scanId,
      expect.objectContaining({ status: ScanPromptStatus.COMPLETED }),
    );
  });

  it('marks the scan COMPLETED with the computed visibility score when this is the last prompt to finish', async () => {
    const completedScan = {
      prompts: [
        { result: { brandMentioned: true, competitorsMentioned: ['OrbitDesk'], citationDomains: ['reviews.test'] } },
        { result: { brandMentioned: false, competitorsMentioned: [], citationDomains: [] } },
        { result: null },
      ],
    };

    const { processor, manager, visibilityScoringService } = buildProcessor({
      queryResult: { processedPrompts: 3, totalPrompts: 3 },
      findOneResult: completedScan,
    });

    const job = { id: 'job-3', data: { scanId, promptId } } as Job<{
      scanId: string;
      promptId: string;
    }>;

    await processor.process(job);

    expect(manager.findOne).toHaveBeenCalledWith(Scan, {
      where: { id: scanId },
      relations: { prompts: { result: true } },
    });

    // Only the two prompts that actually have a PromptResult are passed in -
    // the still-null one (shouldn't happen on this exact path, but the
    // filter is what makes the code safe regardless) is excluded.
    expect(visibilityScoringService.computeAggregates).toHaveBeenCalledWith(
      [completedScan.prompts[0].result, completedScan.prompts[1].result],
      3,
    );

    expect(manager.update).toHaveBeenCalledWith(Scan, scanId, {
      status: ScanPromptStatus.COMPLETED,
      completedAt: expect.any(Date),
      visibilityScore: 60,
    });
  });

  it('logs a failure line and rethrows unchanged when the OpenRouter call fails (brief §24 "OpenRouter Unavailable")', async () => {
    const { processor, openRouterService, analyzerClientService } = buildProcessor({
      queryResult: { processedPrompts: 1, totalPrompts: 3 },
    });
    const aiError = new Error('OpenRouter unavailable');
    openRouterService.generate.mockRejectedValueOnce(aiError);

    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    const job = { id: 'job-1', data: { scanId, promptId } } as Job<{
      scanId: string;
      promptId: string;
    }>;

    await expect(processor.process(job)).rejects.toBe(aiError);

    expect(errorSpy).toHaveBeenCalledWith(`[AI] Request failed for prompt ${promptId}`);
    // Never reaches the analyzer call once OpenRouter has already failed.
    expect(analyzerClientService.analyze).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs the brief §25 failure line and rethrows unchanged when the analyzer call fails', async () => {
    const { processor, analyzerClientService } = buildProcessor({
      queryResult: { processedPrompts: 1, totalPrompts: 3 },
    });
    const analyzerError = new Error('analyzer unavailable');
    analyzerClientService.analyze.mockRejectedValueOnce(analyzerError);

    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    const job = { id: 'job-1', data: { scanId, promptId } } as Job<{
      scanId: string;
      promptId: string;
    }>;

    await expect(processor.process(job)).rejects.toBe(analyzerError);

    expect(errorSpy).toHaveBeenCalledWith(`[ANALYZER] Request failed for prompt ${promptId}`);
    errorSpy.mockRestore();
  });

  describe('onJobFailed', () => {
    it('logs "retry scheduled" while attempts remain', () => {
      const { processor } = buildProcessor({ queryResult: { processedPrompts: 1, totalPrompts: 3 } });
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      const job = {
        data: { scanId, promptId },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as unknown as Job<{ scanId: string; promptId: string }>;

      processor.onJobFailed(job);

      expect(errorSpy).toHaveBeenCalledWith(`[WORKER] Job ${promptId} failed — retry scheduled`);
      errorSpy.mockRestore();
    });

    it('logs "no more retries" once attempts are exhausted', () => {
      const { processor } = buildProcessor({ queryResult: { processedPrompts: 1, totalPrompts: 3 } });
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      const job = {
        data: { scanId, promptId },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<{ scanId: string; promptId: string }>;

      processor.onJobFailed(job);

      expect(errorSpy).toHaveBeenCalledWith(`[WORKER] Job ${promptId} failed — no more retries`);
      errorSpy.mockRestore();
    });
  });
});
