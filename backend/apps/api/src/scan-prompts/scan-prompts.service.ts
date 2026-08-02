import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Scan, Prompt, BrandProfile, BrandProfileRole, BrandProfileStatus, ScanPromptStatus } from '@app/common';
import { PromptGeneratorService } from '../prompt-generation/prompt-generator.service';

// EPIC-13's stage 2: generates exactly 3 brand-neutral prompts from a
// scan's already-gathered BRAND-role BrandProfile (STORY-041), once
// intelligence gathering has finished (Scan.status = INTELLIGENCE_READY).
@Injectable()
export class ScanPromptsService {
  private readonly logger = new Logger('SCAN_PROMPTS');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly promptGeneratorService: PromptGeneratorService,
  ) {}

  async create(scanId: string): Promise<{ scanId: string; prompts: string[] }> {
    const scan = await this.dataSource.getRepository(Scan).findOneBy({ id: scanId });
    if (!scan) {
      throw new NotFoundException(`Scan ${scanId} not found`);
    }
    if (scan.status !== ScanPromptStatus.INTELLIGENCE_READY) {
      throw new ConflictException(
        `Scan ${scanId} is not ready for prompt generation (current status: ${scan.status})`,
      );
    }

    const brandProfile = await this.dataSource.getRepository(BrandProfile).findOneByOrFail({
      scanId,
      role: BrandProfileRole.BRAND,
    });

    // The BRAND row itself can be FAILED (its own crawl/summarization
    // failed) even though every entity for the scan has reached a
    // terminal status (which is all INTELLIGENCE_READY requires) - there
    // is no gathered intelligence to generate prompts from in that case,
    // so this fails immediately rather than calling the AI with
    // null/missing fields.
    if (brandProfile.status !== BrandProfileStatus.COMPLETED) {
      throw new UnprocessableEntityException(
        'Unable to generate prompts: the brand\'s own intelligence gathering did not complete successfully.',
      );
    }

    let prompts: string[];
    try {
      prompts = await this.promptGeneratorService.generatePrompts({
        name: brandProfile.name!,
        servicesOffered: brandProfile.servicesOffered!,
        metaDescription: brandProfile.metaDescription!,
        summary: brandProfile.summary!,
      });
    } catch (error) {
      this.logger.error(
        `[SCAN_PROMPTS] Generation failed for scan ${scanId}: ${(error as Error).message}`,
      );
      throw new UnprocessableEntityException(
        'Unable to generate prompts from the gathered brand intelligence.',
      );
    }

    // Both UnprocessableEntityException throws above happen before this
    // line - no partial Prompt/Scan write is ever possible, same
    // guarantee EPIC-12 established for its own generation failure.
    await this.dataSource.transaction(async (manager) => {
      const promptRows = prompts.map((text) => manager.create(Prompt, { scanId, text }));
      await manager.save(promptRows);
      await manager.update(Scan, scanId, {
        totalPrompts: prompts.length,
        status: ScanPromptStatus.PROMPTS_GENERATED,
      });
    });

    this.logger.log(`[SCAN_PROMPTS] Generated ${prompts.length} prompts for scan ${scanId}`);

    return { scanId, prompts };
  }
}
