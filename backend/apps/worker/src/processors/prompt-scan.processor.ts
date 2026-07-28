import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Prompt, Scan, ScanPromptStatus, PROMPT_SCAN_QUEUE } from '@app/common';

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
  ) {
    super();
  }

  async process(job: Job<PromptScanJobData>): Promise<void> {
    this.logger.log(`[WORKER] Processing ${job.id}`);

    const { scanId, promptId } = job.data;

    // Step 1 of the brief's Worker Processing Flow (§15) - the rest of the
    // flow (steps 2-9: call OpenRouter, call the analyzer, persist a
    // PromptResult, mark completed, score the scan) is stubbed here and
    // wired for real in STORY-011/012 (AI), STORY-013-016 (analyzer), and
    // STORY-017/018 (full orchestration + scoring).
    await this.promptRepository.update(promptId, {
      status: ScanPromptStatus.PROCESSING,
    });
    await this.scanRepository.update(scanId, {
      status: ScanPromptStatus.PROCESSING,
    });

    // TODO(STORY-012): send the prompt (+ product-dataset context) to
    // OpenRouter and receive the generated response.
    // TODO(STORY-016/017): send the AI response to the Rust analyzer and
    // receive its structured analysis.
    // TODO(STORY-017): persist a PromptResult row from that analysis, set
    // Prompt.status = COMPLETED, increment Scan.processedPrompts.
    // TODO(STORY-018): once every prompt in the scan is done, compute the
    // visibility score + aggregates and mark the scan COMPLETED.
  }
}
