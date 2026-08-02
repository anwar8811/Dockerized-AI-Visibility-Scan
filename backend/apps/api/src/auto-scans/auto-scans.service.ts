import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import {
  Scan,
  BrandProfile,
  BrandProfileRole,
  ScanPromptStatus,
  BRAND_INTELLIGENCE_QUEUE,
  BRAND_INTELLIGENCE_JOB_NAME,
  buildBrandIntelligenceJobId,
} from '@app/common';
import { CreateAutoScanDto } from './dto/create-auto-scan.dto';

// EPIC-13 (KAD-21): POST /scans/auto no longer crawls/detects/generates
// inline - it only creates the Scan + one BrandProfile row per entity
// (brand + each competitor), enqueues one independent BullMQ job per
// entity (KAD-23), and returns immediately. The actual gathering happens
// in apps/worker's BrandIntelligenceProcessor (STORY-041).
@Injectable()
export class AutoScansService {
  private readonly logger = new Logger('AUTO_SCAN');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(BRAND_INTELLIGENCE_QUEUE) private readonly brandIntelligenceQueue: Queue,
  ) {}

  async create(dto: CreateAutoScanDto): Promise<{ scanId: string; status: string }> {
    // One Scan row + one BrandProfile row per entity, in a single
    // transaction - same "no partial write" guarantee as
    // ScansService.createFromResolvedInputs().
    const { scan, brandProfiles } = await this.dataSource.transaction(async (manager) => {
      const scan = manager.create(Scan, {
        // Left empty until STORY-041 resolves the brand's real name (from
        // the BRAND-role BrandProfile below) - Scan.brandName itself
        // stays NOT NULL, so this is a placeholder, never displayed as a
        // real brand name while status is GATHERING_INTELLIGENCE.
        brandName: dto.brandName ?? '',
        website: dto.website,
        competitors: dto.competitors,
        totalPrompts: 0,
        status: ScanPromptStatus.GATHERING_INTELLIGENCE,
      });
      await manager.save(scan);

      const brandRow = manager.create(BrandProfile, {
        scanId: scan.id,
        role: BrandProfileRole.BRAND,
        name: dto.brandName ?? null,
        sourceUrl: dto.website,
      });
      const competitorRows = dto.competitors.map((name) =>
        manager.create(BrandProfile, {
          scanId: scan.id,
          role: BrandProfileRole.COMPETITOR,
          name,
          sourceUrl: null,
        }),
      );

      const brandProfiles = [brandRow, ...competitorRows];
      await manager.save(brandProfiles);

      return { scan, brandProfiles };
    });

    this.logger.log(
      `[AUTO_SCAN] Created scan ${scan.id}, gathering intelligence for ${brandProfiles.length} entities`,
    );

    // Enqueue only after the transaction has committed - a job must never
    // point at a scan/brand_profile row that doesn't actually exist yet.
    // Each entity becomes its own independent job (KAD-23); the
    // deterministic jobId means accidentally enqueueing the same entity
    // twice is a no-op, never a duplicate job.
    await Promise.all(
      brandProfiles.map((profile) =>
        this.brandIntelligenceQueue
          .add(
            BRAND_INTELLIGENCE_JOB_NAME,
            { scanId: scan.id, brandProfileId: profile.id },
            {
              jobId: buildBrandIntelligenceJobId(scan.id, profile.id),
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          )
          .then(() => this.logger.log(`[QUEUE] Added brand-intelligence job for ${profile.id}`)),
      ),
    );

    return { scanId: scan.id, status: scan.status };
  }
}
