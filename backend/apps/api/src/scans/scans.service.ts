import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import {
  Scan,
  Prompt,
  PROMPT_SCAN_QUEUE,
  PROMPT_SCAN_JOB_NAME,
  buildPromptJobId,
  computeCompetitorCitationMetrics,
} from '@app/common';
import { CreateScanDto } from './dto/create-scan.dto';
import { ScanDetailResponse } from './interfaces/scan-detail-response.interface';

@Injectable()
export class ScansService {
  private readonly logger = new Logger('SCAN');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(PROMPT_SCAN_QUEUE) private readonly promptScanQueue: Queue,
  ) {}

  async create(dto: CreateScanDto): Promise<{ scanId: string; status: string }> {
    // One Scan row + one Prompt row per submitted prompt, in a single
    // transaction - a partial write (scan created but a prompt insert
    // failing) can never happen.
    const { scan, prompts } = await this.dataSource.transaction(
      async (manager) => {
        const scan = manager.create(Scan, {
          brandName: dto.brandName,
          website: dto.website,
          competitors: dto.competitors,
          totalPrompts: dto.prompts.length,
        });
        await manager.save(scan);

        const prompts = dto.prompts.map((text) =>
          manager.create(Prompt, { scanId: scan.id, text }),
        );
        await manager.save(prompts);

        return { scan, prompts };
      },
    );

    this.logger.log(`[SCAN] Created scan ${scan.id}`);

    // Enqueue only after the transaction has committed - a job must never
    // point at a scan/prompt row that doesn't actually exist yet. Each
    // prompt becomes its own independent job; the deterministic jobId
    // means accidentally enqueueing the same prompt twice is a no-op,
    // never a duplicate job.
    await Promise.all(
      prompts.map((prompt) =>
        this.promptScanQueue
          .add(
            PROMPT_SCAN_JOB_NAME,
            { scanId: scan.id, promptId: prompt.id },
            {
              jobId: buildPromptJobId(scan.id, prompt.id),
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          )
          .then(() => this.logger.log(`[QUEUE] Added prompt ${prompt.id}`)),
      ),
    );

    return { scanId: scan.id, status: scan.status };
  }

  // This query's shape is fixed here, in STORY-007, even though no
  // PromptResult rows existed yet at that stage of the build (so every
  // aggregate below came back empty/default). STORY-018 (visibility
  // scoring + scan completion) only ever had to make prompt_result rows
  // exist - it never needed to touch this method's shape.
  async getScanWithAggregates(id: string): Promise<ScanDetailResponse | null> {
    const scan = await this.dataSource.getRepository(Scan).findOne({
      where: { id },
      relations: { prompts: { result: true } },
    });
    if (!scan) {
      return null;
    }

    // "results" (FR2.1) means processed prompt results - only prompts
    // that already have a PromptResult are included, not every prompt.
    const completedPrompts = scan.prompts.filter((prompt) => prompt.result);

    // Same formula the worker uses to decide scan completion (STORY-018) -
    // computeCompetitorCitationMetrics lives once, in @app/common, and is
    // never re-derived here.
    const { competitorMentions, topCompetitor, citationDomains } =
      computeCompetitorCitationMetrics(completedPrompts.map((prompt) => prompt.result!));

    const results = completedPrompts.map((prompt) => ({
      promptId: prompt.id,
      text: prompt.text,
      status: prompt.status,
      aiResponse: prompt.result!.aiResponse,
      brandMentioned: prompt.result!.brandMentioned,
      brandMentionCount: prompt.result!.brandMentionCount,
      competitorsMentioned: prompt.result!.competitorsMentioned,
      citationDomains: prompt.result!.citationDomains,
    }));

    return {
      id: scan.id,
      brandName: scan.brandName,
      website: scan.website,
      competitors: scan.competitors,
      status: scan.status,
      totalPrompts: scan.totalPrompts,
      processedPrompts: scan.processedPrompts,
      visibilityScore: scan.visibilityScore,
      competitorMentions,
      topCompetitor,
      citationDomains,
      results,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt,
      completedAt: scan.completedAt,
    };
  }
}
