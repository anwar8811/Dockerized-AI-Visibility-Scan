import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import {
  Scan,
  ScanPromptStatus,
  PROMPT_RANK_QUEUE,
  PROMPT_RANK_JOB_NAME,
  buildPromptRankJobId,
} from '@app/common';

// EPIC-13's stage 3 trigger: enqueues one prompt-rank job per Prompt row
// (already created by STORY-043) and returns immediately - the actual
// AI-calling/ranking work happens in STORY-046's worker processor, not
// this endpoint.
@Injectable()
export class ScanAnalysisService {
  private readonly logger = new Logger('SCAN_ANALYSIS');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(PROMPT_RANK_QUEUE) private readonly promptRankQueue: Queue,
  ) {}

  async create(scanId: string): Promise<{ scanId: string; status: string }> {
    // Status guard + status update happen inside one transaction; the
    // enqueue loop runs only after that transaction commits - same
    // "enqueue only after commit" rule as ScansService.createFromResolvedInputs()
    // and AutoScansService.create().
    const scan = await this.dataSource.transaction(async (manager) => {
      const scan = await manager.findOne(Scan, {
        where: { id: scanId },
        relations: { prompts: true },
      });
      if (!scan) {
        throw new NotFoundException(`Scan ${scanId} not found`);
      }
      if (scan.status !== ScanPromptStatus.PROMPTS_GENERATED) {
        throw new ConflictException(
          `Scan ${scanId} is not ready for analysis (current status: ${scan.status})`,
        );
      }

      await manager.update(Scan, scanId, { status: ScanPromptStatus.PROCESSING });
      return scan;
    });

    await Promise.all(
      scan.prompts.map((prompt) =>
        this.promptRankQueue
          .add(
            PROMPT_RANK_JOB_NAME,
            { scanId, promptId: prompt.id },
            {
              jobId: buildPromptRankJobId(scanId, prompt.id),
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          )
          .then(() => this.logger.log(`[QUEUE] Added prompt-rank job for ${prompt.id}`)),
      ),
    );

    this.logger.log(
      `[SCAN_ANALYSIS] Scan ${scanId} moved to PROCESSING, ${scan.prompts.length} prompt-rank jobs enqueued`,
    );

    return { scanId, status: ScanPromptStatus.PROCESSING };
  }
}
