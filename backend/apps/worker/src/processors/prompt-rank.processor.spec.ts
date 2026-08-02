import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prompt, Scan, PromptResult, PromptResultRanking, ScanPromptStatus, callOpenRouterChatCompletion } from '@app/common';
import { PromptRankProcessor } from './prompt-rank.processor';

// Partial mock, same pattern as brand-intelligence.processor.spec.ts: real
// entity classes/enums are used directly in assertions and at
// @Processor(PROMPT_RANK_QUEUE) module-load time, only
// callOpenRouterChatCompletion (a plain function, not a NestJS-injected
// service) needs mocking.
jest.mock('@app/common', () => ({
  ...jest.requireActual('@app/common'),
  callOpenRouterChatCompletion: jest.fn(),
}));

const mockedCallOpenRouterChatCompletion = callOpenRouterChatCompletion as jest.Mock;

describe('PromptRankProcessor', () => {
  const scanId = 'scan-1';
  const promptId = 'prompt-1';

  const entities = [
    { id: 'brand-1', name: 'NimbusCRM' },
    { id: 'comp-1', name: 'OrbitDesk' },
  ];

  function buildProcessor(options: {
    queryResult: { processedPrompts: number; totalPrompts: number };
  }) {
    const prompt = { id: promptId, text: 'What CRM should I use for a small agency?' };

    const promptRepository = {
      findOneByOrFail: jest.fn().mockResolvedValue(prompt),
      update: jest.fn(),
    };
    const brandProfileRepository = {
      find: jest.fn().mockResolvedValue(entities),
    };

    const manager = {
      // Returns a shallow clone, not the same reference as the input data
      // object - save() below mutates the returned entity (adding a
      // generated id, mirroring real TypeORM behavior), and cloning here
      // keeps that mutation from leaking back into the exact object
      // literal the processor passed to create(), which is what
      // toHaveBeenCalledWith() below asserts against.
      create: jest.fn((_entity, data) => ({ ...data })),
      // Mirrors real TypeORM behavior: save() mutates the passed-in entity
      // in place, assigning its generated id back onto it - the processor
      // relies on this to read promptResult.id right after awaiting save().
      save: jest.fn().mockImplementation((value) => {
        if (Array.isArray(value)) {
          return Promise.resolve(value);
        }
        value.id = 'prompt-result-1';
        return Promise.resolve(value);
      }),
      update: jest.fn(),
      query: jest.fn().mockResolvedValue([[options.queryResult], 1]),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) => callback(manager)),
    };

    const rankAnalysis = {
      rankings: [
        { entityId: 'brand-1', mentionCount: 2, rank: 1 },
        { entityId: 'comp-1', mentionCount: 1, rank: 2 },
      ],
      citationDomains: ['reviews.test'],
    };
    const analyzerClientService = { analyzeRank: jest.fn().mockResolvedValue(rankAnalysis) };

    mockedCallOpenRouterChatCompletion.mockReset();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('NimbusCRM is a solid pick for small teams.');

    const httpService = {} as any;

    const processor = new PromptRankProcessor(
      promptRepository as any,
      brandProfileRepository as any,
      dataSource as any,
      httpService,
      analyzerClientService as any,
    );

    return {
      processor,
      prompt,
      promptRepository,
      brandProfileRepository,
      manager,
      dataSource,
      analyzerClientService,
      rankAnalysis,
      httpService,
    };
  }

  afterEach(() => {
    delete process.env.OPENROUTER_ANSWER_MODEL;
  });

  it('gets an AI response pinned to OPENROUTER_ANSWER_MODEL, ranks it via the analyzer, and persists one PromptResult + one PromptResultRanking row per entity', async () => {
    process.env.OPENROUTER_ANSWER_MODEL = 'openai/gpt-oss-20b:free';

    const {
      processor,
      prompt,
      promptRepository,
      brandProfileRepository,
      manager,
      dataSource,
      analyzerClientService,
      httpService,
    } = buildProcessor({ queryResult: { processedPrompts: 1, totalPrompts: 3 } });

    const job = { id: 'job-1', data: { scanId, promptId } } as Job<{ scanId: string; promptId: string }>;

    await processor.process(job);

    expect(brandProfileRepository.find).toHaveBeenCalledWith({ where: { scanId } });
    expect(promptRepository.update).toHaveBeenCalledWith(promptId, {
      status: ScanPromptStatus.PROCESSING,
    });

    expect(mockedCallOpenRouterChatCompletion).toHaveBeenCalledWith(httpService, {
      systemInstruction: expect.any(String),
      userMessage: prompt.text,
      model: 'openai/gpt-oss-20b:free',
    });

    expect(analyzerClientService.analyzeRank).toHaveBeenCalledWith({
      response: 'NimbusCRM is a solid pick for small teams.',
      entities: [
        { id: 'brand-1', name: 'NimbusCRM' },
        { id: 'comp-1', name: 'OrbitDesk' },
      ],
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.create).toHaveBeenCalledWith(PromptResult, {
      promptId,
      aiResponse: 'NimbusCRM is a solid pick for small teams.',
      brandMentioned: null,
      brandMentionCount: null,
      competitorsMentioned: null,
      citationDomains: ['reviews.test'],
    });
    expect(manager.create).toHaveBeenCalledWith(PromptResultRanking, {
      promptResultId: 'prompt-result-1',
      brandProfileId: 'brand-1',
      mentionCount: 2,
      rank: 1,
    });
    expect(manager.create).toHaveBeenCalledWith(PromptResultRanking, {
      promptResultId: 'prompt-result-1',
      brandProfileId: 'comp-1',
      mentionCount: 1,
      rank: 2,
    });
    expect(manager.update).toHaveBeenCalledWith(Prompt, promptId, {
      status: ScanPromptStatus.COMPLETED,
    });

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('RETURNING'), [scanId]);
    // processedPrompts (1) !== totalPrompts (3) - scan is not marked complete.
    expect(manager.update).not.toHaveBeenCalledWith(
      Scan,
      scanId,
      expect.objectContaining({ status: ScanPromptStatus.COMPLETED }),
    );
  });

  it('marks the scan COMPLETED with completedAt set when this is the last prompt to finish', async () => {
    const { processor, manager } = buildProcessor({
      queryResult: { processedPrompts: 3, totalPrompts: 3 },
    });

    const job = { id: 'job-3', data: { scanId, promptId } } as Job<{ scanId: string; promptId: string }>;

    await processor.process(job);

    expect(manager.update).toHaveBeenCalledWith(Scan, scanId, {
      status: ScanPromptStatus.COMPLETED,
      completedAt: expect.any(Date),
    });
  });

  it('logs a failure line and rethrows unchanged when the AI call fails, without ever calling the analyzer', async () => {
    const { processor, analyzerClientService } = buildProcessor({
      queryResult: { processedPrompts: 1, totalPrompts: 3 },
    });
    const aiError = new Error('OpenRouter unavailable');
    mockedCallOpenRouterChatCompletion.mockRejectedValueOnce(aiError);

    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    const job = { id: 'job-1', data: { scanId, promptId } } as Job<{ scanId: string; promptId: string }>;

    await expect(processor.process(job)).rejects.toBe(aiError);

    expect(errorSpy).toHaveBeenCalledWith(`[AI] Request failed for prompt ${promptId}`);
    expect(analyzerClientService.analyzeRank).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs a failure line and rethrows unchanged when the analyzer rank call fails', async () => {
    const { processor, analyzerClientService } = buildProcessor({
      queryResult: { processedPrompts: 1, totalPrompts: 3 },
    });
    const analyzerError = new Error('analyzer unavailable');
    analyzerClientService.analyzeRank.mockRejectedValueOnce(analyzerError);

    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    const job = { id: 'job-1', data: { scanId, promptId } } as Job<{ scanId: string; promptId: string }>;

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

      expect(errorSpy).toHaveBeenCalledWith(`[PROMPT_RANK] Job ${promptId} failed — retry scheduled`);
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

      expect(errorSpy).toHaveBeenCalledWith(`[PROMPT_RANK] Job ${promptId} failed — no more retries`);
      errorSpy.mockRestore();
    });
  });
});
