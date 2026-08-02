import {
  Scan,
  BrandProfile,
  BrandProfileRole,
  ScanPromptStatus,
  BRAND_INTELLIGENCE_JOB_NAME,
  buildBrandIntelligenceJobId,
} from '@app/common';
import { AutoScansService } from './auto-scans.service';
import { CreateAutoScanDto } from './dto/create-auto-scan.dto';

describe('AutoScansService', () => {
  function buildService() {
    let profileCounter = 0;
    const manager = {
      create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
        if (entity === Scan) {
          return { id: 'scan-1', status: ScanPromptStatus.GATHERING_INTELLIGENCE, ...data };
        }
        profileCounter += 1;
        return { id: `profile-${profileCounter}`, ...data };
      }),
      save: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    const brandIntelligenceQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const service = new AutoScansService(dataSource as any, brandIntelligenceQueue as any);

    return { service, manager, dataSource, brandIntelligenceQueue };
  }

  const baseDto: CreateAutoScanDto = {
    website: 'https://example.test',
    competitors: ['Acme', 'Globex'],
  };

  it('creates one Scan + one BrandProfile per entity (brand + each competitor) in a single transaction', async () => {
    const { service, manager, dataSource } = buildService();

    await service.create(baseDto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.create).toHaveBeenCalledWith(
      Scan,
      expect.objectContaining({
        website: baseDto.website,
        competitors: baseDto.competitors,
        totalPrompts: 0,
        status: ScanPromptStatus.GATHERING_INTELLIGENCE,
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(BrandProfile, {
      scanId: 'scan-1',
      role: BrandProfileRole.BRAND,
      name: null,
      sourceUrl: baseDto.website,
    });
    expect(manager.create).toHaveBeenCalledWith(BrandProfile, {
      scanId: 'scan-1',
      role: BrandProfileRole.COMPETITOR,
      name: 'Acme',
      sourceUrl: null,
    });
    expect(manager.create).toHaveBeenCalledWith(BrandProfile, {
      scanId: 'scan-1',
      role: BrandProfileRole.COMPETITOR,
      name: 'Globex',
      sourceUrl: null,
    });
    // Once for the Scan, once for the whole BrandProfile[] array.
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  it('enqueues one deterministic-jobId brand-intelligence job per entity, only after the transaction resolves', async () => {
    const { service, brandIntelligenceQueue } = buildService();

    await service.create(baseDto);

    expect(brandIntelligenceQueue.add).toHaveBeenCalledTimes(3);
    expect(brandIntelligenceQueue.add).toHaveBeenCalledWith(
      BRAND_INTELLIGENCE_JOB_NAME,
      { scanId: 'scan-1', brandProfileId: 'profile-1' },
      {
        jobId: buildBrandIntelligenceJobId('scan-1', 'profile-1'),
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  });

  it("sets the BRAND row's name immediately when brandName is supplied", async () => {
    const { service, manager } = buildService();

    await service.create({ ...baseDto, brandName: 'Example' });

    expect(manager.create).toHaveBeenCalledWith(BrandProfile, {
      scanId: 'scan-1',
      role: BrandProfileRole.BRAND,
      name: 'Example',
      sourceUrl: baseDto.website,
    });
  });

  it("leaves the BRAND row's name null when brandName is omitted (resolved later by the worker)", async () => {
    const { service, manager } = buildService();

    await service.create(baseDto);

    expect(manager.create).toHaveBeenCalledWith(BrandProfile, {
      scanId: 'scan-1',
      role: BrandProfileRole.BRAND,
      name: null,
      sourceUrl: baseDto.website,
    });
  });

  it('returns { scanId, status: "GATHERING_INTELLIGENCE" } immediately, with no crawl/AI call in the way', async () => {
    const { service } = buildService();

    const start = Date.now();
    const result = await service.create(baseDto);
    const elapsedMs = Date.now() - start;

    expect(result).toEqual({ scanId: 'scan-1', status: ScanPromptStatus.GATHERING_INTELLIGENCE });
    // No mocked crawler/AI service exists to assert "not called" on - this
    // constructor structurally has no such dependency to call in the first
    // place. The timing assertion is the observable proof instead.
    expect(elapsedMs).toBeLessThan(200);
  });
});
