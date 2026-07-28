import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Scan, Prompt } from '@app/common';
import { CreateScanDto } from './dto/create-scan.dto';
import { ScanDetailResponse } from './interfaces/scan-detail-response.interface';

@Injectable()
export class ScansService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(dto: CreateScanDto): Promise<{ scanId: string; status: string }> {
    // One Scan row + one Prompt row per submitted prompt, in a single
    // transaction - a partial write (scan created but a prompt insert
    // failing) can never happen.
    return this.dataSource.transaction(async (manager) => {
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

      // No BullMQ job is enqueued here - that is deliberately deferred to
      // STORY-009, so this story is reviewable purely as "can I create a
      // scan," independent of the queue.
      return { scanId: scan.id, status: scan.status };
    });
  }

  // This query's shape is fixed here, in STORY-007, even though no
  // PromptResult rows exist yet at this stage of the build (so every
  // aggregate below comes back empty/default). STORY-018 (visibility
  // scoring + scan completion) only ever has to make prompt_result rows
  // exist - it never needs to touch this method's shape.
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

    const competitorMentions: Record<string, number> = {};
    for (const prompt of completedPrompts) {
      for (const competitor of prompt.result!.competitorsMentioned) {
        competitorMentions[competitor] = (competitorMentions[competitor] ?? 0) + 1;
      }
    }

    const topCompetitor =
      Object.entries(competitorMentions).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null;

    const citationDomains = [
      ...new Set(completedPrompts.flatMap((prompt) => prompt.result!.citationDomains)),
    ];

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
