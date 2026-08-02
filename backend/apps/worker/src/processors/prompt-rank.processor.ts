import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import {
  Prompt,
  Scan,
  BrandProfile,
  PromptResult,
  PromptResultRanking,
  ScanPromptStatus,
  PROMPT_RANK_QUEUE,
  callOpenRouterChatCompletion,
} from '@app/common';
import { AnalyzerClientService } from '../analyzer/analyzer-client.service';

interface PromptRankJobData {
  scanId: string;
  promptId: string;
}

// Deliberately plain: this flow's question is one of the 3 brand-neutral
// prompts (STORY-043), answered as a normal user question - no
// product-dataset context injection like apps/worker's classic
// OpenRouterService (FR6.1), and this instruction is never reused there.
const SYSTEM_INSTRUCTION =
  'You are a helpful assistant. Answer the user\'s question directly and naturally, as you would in a normal conversation.';

// Consumes STORY-045's prompt-rank queue - one job per Prompt row
// (EPIC-13's stage 3). Structurally similar to prompt-scan.processor.ts
// (load prompt/scan, call AI, call analyzer, persist, atomic completion
// check) but never touches brandMentioned/brandMentionCount/
// competitorsMentioned (KAD-27), calls the analyzer's POST /analyze/rank
// route instead of POST /analyze, and pins a distinct OpenRouter model
// (KAD-24) via callOpenRouterChatCompletion() directly rather than the
// worker's existing OpenRouterService.
@Injectable()
@Processor(PROMPT_RANK_QUEUE)
export class PromptRankProcessor extends WorkerHost {
  private readonly logger = new Logger('PROMPT_RANK');

  constructor(
    @InjectRepository(Prompt) private readonly promptRepository: Repository<Prompt>,
    @InjectRepository(BrandProfile)
    private readonly brandProfileRepository: Repository<BrandProfile>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly analyzerClientService: AnalyzerClientService,
  ) {
    super();
  }

  async process(job: Job<PromptRankJobData>): Promise<void> {
    const { scanId, promptId } = job.data;

    this.logger.log(`[PROMPT_RANK] Processing ${promptId}`);

    const prompt = await this.promptRepository.findOneByOrFail({ id: promptId });
    const entities = await this.brandProfileRepository.find({ where: { scanId } });

    await this.promptRepository.update(promptId, { status: ScanPromptStatus.PROCESSING });

    // Same log-and-rethrow, never-swallowed contract as
    // prompt-scan.processor.ts - BullMQ (attempts: 3 + exponential
    // backoff, STORY-009) decides the retry, not this processor.
    let aiResponse: string;
    try {
      aiResponse = await callOpenRouterChatCompletion(this.httpService, {
        systemInstruction: SYSTEM_INSTRUCTION,
        userMessage: prompt.text,
        model: process.env.OPENROUTER_ANSWER_MODEL,
      });
    } catch (error) {
      this.logger.error(`[AI] Request failed for prompt ${promptId}`);
      throw error;
    }

    let analysis: Awaited<ReturnType<AnalyzerClientService['analyzeRank']>>;
    try {
      analysis = await this.analyzerClientService.analyzeRank({
        response: aiResponse,
        entities: entities.map((entity) => ({ id: entity.id, name: entity.name! })),
      });
    } catch (error) {
      this.logger.error(`[ANALYZER] Request failed for prompt ${promptId}`);
      throw error;
    }

    // Persist the result, mark the prompt completed, and increment the
    // scan's processed count - all in one transaction, same rationale as
    // prompt-scan.processor.ts: a crash mid-way never leaves a
    // half-updated prompt/scan pair, and a retry after a rollback is
    // safe. PromptResult.promptId's UNIQUE constraint (STORY-005) and
    // PromptResultRanking's UNIQUE(promptResultId, brandProfileId) index
    // (STORY-038) are what make a second successful attempt impossible
    // at the database level, not just unlikely at the application level.
    await this.dataSource.transaction(async (manager) => {
      const promptResult = manager.create(PromptResult, {
        promptId,
        aiResponse,
        brandMentioned: null,
        brandMentionCount: null,
        competitorsMentioned: null,
        citationDomains: analysis.citationDomains,
      });
      await manager.save(promptResult);

      const rankingRows = analysis.rankings.map((ranking) =>
        manager.create(PromptResultRanking, {
          promptResultId: promptResult.id,
          brandProfileId: ranking.entityId,
          mentionCount: ranking.mentionCount,
          rank: ranking.rank,
        }),
      );
      await manager.save(rankingRows);

      await manager.update(Prompt, promptId, { status: ScanPromptStatus.COMPLETED });
      this.logger.log('[DATABASE] PromptResult + PromptResultRanking stored');

      // Same atomic "did we just finish?" pattern as STORY-018/
      // prompt-scan.processor.ts - one UPDATE ... RETURNING round trip,
      // not a separate read-then-write, so whichever of 3 near-
      // simultaneous prompt-rank jobs for this scan commits its
      // increment LAST is the only one that can ever observe
      // processedPrompts === totalPrompts here.
      const [rows] = await manager.query(
        `UPDATE scan SET "processedPrompts" = "processedPrompts" + 1 WHERE id = $1 RETURNING "processedPrompts", "totalPrompts"`,
        [scanId],
      );
      const { processedPrompts, totalPrompts } = rows[0];
      this.logger.log(`[SCAN] ${processedPrompts}/${totalPrompts} prompts completed`);

      if (processedPrompts === totalPrompts) {
        await manager.update(Scan, scanId, {
          status: ScanPromptStatus.COMPLETED,
          completedAt: new Date(),
        });
        this.logger.log(`[SCAN] Scan ${scanId} completed`);
      }
    });

    this.logger.log(`[PROMPT_RANK] Completed ${promptId}`);
  }

  @OnWorkerEvent('failed')
  onJobFailed(job: Job<PromptRankJobData> | undefined): void {
    if (!job) {
      return;
    }
    const willRetry = job.attemptsMade < (job.opts.attempts ?? 1);
    this.logger.error(
      willRetry
        ? `[PROMPT_RANK] Job ${job.data.promptId} failed — retry scheduled`
        : `[PROMPT_RANK] Job ${job.data.promptId} failed — no more retries`,
    );
  }
}
