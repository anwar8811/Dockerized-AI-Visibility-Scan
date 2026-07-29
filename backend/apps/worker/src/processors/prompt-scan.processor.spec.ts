import { Job } from 'bullmq';
import { Prompt, Scan, PromptResult, ScanPromptStatus } from '@app/common';
import { PromptScanProcessor } from './prompt-scan.processor';

describe('PromptScanProcessor', () => {
  const scanId = 'scan-1';
  const promptId = 'prompt-1';

  function buildProcessor() {
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
      increment: jest.fn(),
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

    const processor = new PromptScanProcessor(
      promptRepository as any,
      scanRepository as any,
      dataSource as any,
      openRouterService as any,
      analyzerClientService as any,
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
    } = buildProcessor();

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
    expect(manager.increment).toHaveBeenCalledWith(Scan, { id: scanId }, 'processedPrompts', 1);
  });
});
