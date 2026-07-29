import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Prompt, Scan, PromptResult, ScanPromptStatus, PROMPT_SCAN_QUEUE } from '@app/common';
import { OpenRouterService } from '../ai/openrouter.service';
import { AnalyzerClientService } from '../analyzer/analyzer-client.service';
import { VisibilityScoringService } from '../scoring/visibility-scoring.service';

interface PromptScanJobData {
  scanId: string;
  promptId: string;
}

@Injectable()
@Processor(PROMPT_SCAN_QUEUE)
export class PromptScanProcessor extends WorkerHost {
  private readonly logger = new Logger('WORKER');

  constructor(
    @InjectRepository(Prompt) private readonly promptRepository: Repository<Prompt>,
    @InjectRepository(Scan) private readonly scanRepository: Repository<Scan>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly openRouterService: OpenRouterService,
    private readonly analyzerClientService: AnalyzerClientService,
    private readonly visibilityScoringService: VisibilityScoringService,
  ) {
    super();
  }

  async process(job: Job<PromptScanJobData>): Promise<void> {
    const { scanId, promptId } = job.data;

    this.logger.log(`[WORKER] Processing ${promptId}`);

    // Step 1 of the brief's Worker Processing Flow (§15).
    const prompt = await this.promptRepository.findOneByOrFail({ id: promptId });
    const scan = await this.scanRepository.findOneByOrFail({ id: scanId });

    await this.promptRepository.update(promptId, {
      status: ScanPromptStatus.PROCESSING,
    });
    await this.scanRepository.update(scanId, {
      status: ScanPromptStatus.PROCESSING,
    });

    // Steps 2-3: ask OpenRouter, then hand its raw response to the Rust
    // analyzer for deterministic brand/competitor/citation detection. Any
    // error thrown here is deliberately left uncaught (beyond the
    // log-and-rethrow below) - it must propagate so BullMQ's configured
    // retry (STORY-009) takes over; STORY-020 is where the retry/failure
    // semantics get hardened, not this story.
    const aiResponse = await this.openRouterService.generate(prompt.text);

    let analysis: Awaited<ReturnType<AnalyzerClientService['analyze']>>;
    try {
      analysis = await this.analyzerClientService.analyze({
        brand: scan.brandName,
        competitors: scan.competitors,
        response: aiResponse,
      });
    } catch (error) {
      // Matches the brief's §25 failure-log example exactly - logged here
      // (not inside AnalyzerClientService) because only the processor knows
      // which prompt this request was for. The error is rethrown unchanged
      // straight after - this only adds observability, it never swallows.
      this.logger.error(`[ANALYZER] Request failed for prompt ${promptId}`);
      throw error;
    }

    // Steps 4-6: persist the result, mark the prompt completed, and
    // increment the scan's processed count - all in one transaction, so a
    // crash mid-way never leaves a half-updated prompt/scan pair, and a
    // retry after a rollback is safe. PromptResult.promptId's UNIQUE
    // constraint (STORY-005) is what then makes a second successful
    // attempt at the same prompt impossible at the database level, not
    // just unlikely at the application level.
    await this.dataSource.transaction(async (manager) => {
      const promptResult = manager.create(PromptResult, {
        promptId,
        aiResponse,
        brandMentioned: analysis.brandMentioned,
        brandMentionCount: analysis.brandMentionCount,
        competitorsMentioned: analysis.competitorsMentioned,
        citationDomains: analysis.citationDomains,
      });
      await manager.save(promptResult);
      await manager.update(Prompt, promptId, { status: ScanPromptStatus.COMPLETED });
      this.logger.log('[DATABASE] PromptResult stored');

      // Step 8 of the brief's Worker Processing Flow (§15) - and the "did we
      // just finish?" check for step 9, done as ONE atomic round trip via
      // Postgres's UPDATE ... RETURNING, not a separate read-then-write.
      // Postgres serializes concurrent UPDATEs to the same row, so whichever
      // of two near-simultaneous prompt jobs for this scan commits its
      // increment LAST is the only one that can ever observe
      // processedPrompts === totalPrompts here - a plain re-SELECT after a
      // separate increment could let both (or neither) jobs see "complete".
      //
      // manager.query() on Postgres returns a [rows, affectedRowCount] tuple
      // for a RETURNING statement, not the rows array directly - the row
      // itself is rows[0], not rows.
      const [rows] = await manager.query(
        `UPDATE scan SET "processedPrompts" = "processedPrompts" + 1 WHERE id = $1 RETURNING "processedPrompts", "totalPrompts"`,
        [scanId],
      );
      const { processedPrompts, totalPrompts } = rows[0];
      this.logger.log(`[SCAN] ${processedPrompts}/${totalPrompts} prompts completed`);

      if (processedPrompts === totalPrompts) {
        // Step 9: every prompt in the scan is done - compute the visibility
        // score + aggregates from this scan's prompt_result rows (one query,
        // via the same relations shape ScansService already uses) and mark
        // the scan COMPLETED. competitorMentions/topCompetitor/citationDomains
        // are computed here too (matching the brief's step 9) but are never
        // persisted on Scan - GET /scans/:id recomputes them at read time
        // from prompt_result, via the exact same @app/common functions.
        const completedScan = await manager.findOne(Scan, {
          where: { id: scanId },
          relations: { prompts: { result: true } },
        });
        const scanPromptResults = completedScan!.prompts
          .map((p) => p.result)
          .filter((result): result is PromptResult => result !== null);

        const { visibilityScore } = this.visibilityScoringService.computeAggregates(
          scanPromptResults,
          totalPrompts,
        );

        await manager.update(Scan, scanId, {
          status: ScanPromptStatus.COMPLETED,
          completedAt: new Date(),
          visibilityScore,
        });
        this.logger.log(`[SCAN] Scan ${scanId} completed`);
      }
    });

    this.logger.log(`[WORKER] Completed ${promptId}`);
  }

  // §7 of the brief lists @OnWorkerEvent() as a required NestJS decorator -
  // this is BullMQ's own "did a job attempt just fail?" hook, the correct
  // place for the brief's §25 job-failure log line. It only observes;
  // job.attemptsMade/job.opts.attempts (not this handler) decide whether
  // BullMQ actually retries.
  @OnWorkerEvent('failed')
  onJobFailed(job: Job<PromptScanJobData> | undefined): void {
    if (!job) {
      return;
    }
    const willRetry = job.attemptsMade < (job.opts.attempts ?? 1);
    this.logger.error(
      willRetry
        ? `[WORKER] Job ${job.data.promptId} failed — retry scheduled`
        : `[WORKER] Job ${job.data.promptId} failed — no more retries`,
    );
  }
}
