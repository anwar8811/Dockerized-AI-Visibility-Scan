import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Prompt, Scan, PromptResult, ScanPromptStatus, PROMPT_SCAN_QUEUE } from '@app/common';
import { OpenRouterService } from '../ai/openrouter.service';
import { AnalyzerClientService } from '../analyzer/analyzer-client.service';

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
  ) {
    super();
  }

  async process(job: Job<PromptScanJobData>): Promise<void> {
    this.logger.log(`[WORKER] Processing ${job.id}`);

    const { scanId, promptId } = job.data;

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
    // error thrown here is deliberately left uncaught - it must propagate
    // so BullMQ's configured retry (STORY-009) takes over; EPIC-08 is
    // where the retry/failure semantics get hardened, not this story.
    const aiResponse = await this.openRouterService.generate(prompt.text);
    const analysis = await this.analyzerClientService.analyze({
      brand: scan.brandName,
      competitors: scan.competitors,
      response: aiResponse,
    });

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
      await manager.increment(Scan, { id: scanId }, 'processedPrompts', 1);
    });

    this.logger.log(`[WORKER] Completed ${job.id}`);

    // TODO(STORY-018): once every prompt in the scan is done, compute the
    // visibility score + aggregates and mark the scan COMPLETED.
  }
}
