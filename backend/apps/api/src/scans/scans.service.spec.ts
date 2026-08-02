import {
  Scan,
  Prompt,
  ScanPromptStatus,
  PROMPT_SCAN_JOB_NAME,
  buildPromptJobId,
} from '@app/common';
import { ScansService } from './scans.service';
import { CreateScanDto } from './dto/create-scan.dto';

describe('ScansService', () => {
  function buildService() {
    let promptCounter = 0;
    const manager = {
      create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
        if (entity === Scan) {
          return { id: 'scan-1', status: ScanPromptStatus.QUEUED, ...data };
        }
        promptCounter += 1;
        return { id: `prompt-${promptCounter}`, status: ScanPromptStatus.QUEUED, ...data };
      }),
      save: jest.fn(),
    };
    const getRepository = jest.fn();
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
      getRepository,
    };
    const promptScanQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const service = new ScansService(dataSource as any, promptScanQueue as any);

    return { service, manager, dataSource, getRepository, promptScanQueue };
  }

  describe('create', () => {
    const dto: CreateScanDto = {
      brandName: 'NimbusCRM',
      website: 'https://nimbuscrm.test',
      competitors: ['OrbitDesk'],
      prompts: ['a', 'b', 'c'],
    };

    it('creates one Scan + one Prompt per submitted prompt in a single transaction', async () => {
      const { service, manager, dataSource } = buildService();

      await service.create(dto);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.create).toHaveBeenCalledWith(Scan, {
        brandName: dto.brandName,
        website: dto.website,
        competitors: dto.competitors,
        totalPrompts: 3,
      });
      expect(manager.create).toHaveBeenCalledWith(Prompt, { scanId: 'scan-1', text: 'a' });
      expect(manager.create).toHaveBeenCalledWith(Prompt, { scanId: 'scan-1', text: 'b' });
      expect(manager.create).toHaveBeenCalledWith(Prompt, { scanId: 'scan-1', text: 'c' });
      // Once for the Scan, once for the whole Prompt[] array.
      expect(manager.save).toHaveBeenCalledTimes(2);
    });

    it('enqueues one deterministic-jobId BullMQ job per prompt, only after the transaction resolves', async () => {
      const { service, promptScanQueue } = buildService();

      await service.create(dto);

      expect(promptScanQueue.add).toHaveBeenCalledTimes(3);
      expect(promptScanQueue.add).toHaveBeenCalledWith(
        PROMPT_SCAN_JOB_NAME,
        { scanId: 'scan-1', promptId: 'prompt-1' },
        {
          jobId: buildPromptJobId('scan-1', 'prompt-1'),
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    });

    it('returns the created scan id and its initial status', async () => {
      const { service } = buildService();

      const result = await service.create(dto);

      expect(result).toEqual({ scanId: 'scan-1', status: ScanPromptStatus.QUEUED });
    });
  });

  describe('getScanWithAggregates', () => {
    it('returns null when the scan does not exist', async () => {
      const { service, getRepository } = buildService();
      const findOne = jest.fn().mockResolvedValue(null);
      getRepository.mockReturnValue({ findOne });

      const result = await service.getScanWithAggregates('missing-id');

      expect(result).toBeNull();
      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'missing-id' },
        relations: {
          prompts: { result: { rankings: { brandProfile: true } } },
          brandProfiles: true,
        },
      });
    });

    it('computes competitorMentions/topCompetitor/citationDomains and includes only prompts that already have a result', async () => {
      const { service, getRepository } = buildService();
      const scan = {
        id: 'scan-1',
        brandName: 'NimbusCRM',
        website: 'https://nimbuscrm.test',
        competitors: ['OrbitDesk', 'ClientLoop'],
        status: ScanPromptStatus.COMPLETED,
        totalPrompts: 2,
        processedPrompts: 2,
        visibilityScore: 100,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:05.000Z'),
        completedAt: new Date('2026-01-01T00:00:05.000Z'),
        prompts: [
          {
            id: 'prompt-1',
            text: 'a',
            status: ScanPromptStatus.COMPLETED,
            result: {
              aiResponse: 'r1',
              brandMentioned: true,
              brandMentionCount: 1,
              competitorsMentioned: ['OrbitDesk'],
              citationDomains: ['reviews.test'],
              rankings: [],
            },
          },
          {
            id: 'prompt-2',
            text: 'b',
            status: ScanPromptStatus.QUEUED,
            result: null,
          },
        ],
        brandProfiles: [],
      };
      getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(scan) });

      const result = await service.getScanWithAggregates('scan-1');

      expect(result).toEqual({
        id: 'scan-1',
        brandName: 'NimbusCRM',
        website: 'https://nimbuscrm.test',
        competitors: ['OrbitDesk', 'ClientLoop'],
        status: ScanPromptStatus.COMPLETED,
        totalPrompts: 2,
        processedPrompts: 2,
        visibilityScore: 100,
        competitorMentions: { OrbitDesk: 1 },
        topCompetitor: 'OrbitDesk',
        citationDomains: ['reviews.test'],
        results: [
          {
            promptId: 'prompt-1',
            text: 'a',
            status: ScanPromptStatus.COMPLETED,
            aiResponse: 'r1',
            brandMentioned: true,
            brandMentionCount: 1,
            competitorsMentioned: ['OrbitDesk'],
            citationDomains: ['reviews.test'],
            rankings: [],
          },
        ],
        brandProfiles: [],
        createdAt: scan.createdAt,
        updatedAt: scan.updatedAt,
        completedAt: scan.completedAt,
      });
    });

    // EPIC-13 (STORY-047) - the new ranked-analysis flow's shape: brandMentioned
    // etc. are null (never fed into the classic aggregates), brandProfiles
    // is populated, and each result's rankings array is sorted by rank
    // regardless of the order BrandProfile rows come back in.
    it('populates brandProfiles and per-result rankings for a ranked-analysis scan, excluding null-brandMentioned rows from the classic aggregates', async () => {
      const { service, getRepository } = buildService();
      const scan = {
        id: 'scan-2',
        brandName: 'NimbusCRM',
        website: 'https://nimbuscrm.test',
        competitors: ['OrbitDesk', 'ClientLoop'],
        status: ScanPromptStatus.COMPLETED,
        totalPrompts: 1,
        processedPrompts: 1,
        visibilityScore: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:05.000Z'),
        completedAt: new Date('2026-01-01T00:00:05.000Z'),
        prompts: [
          {
            id: 'prompt-1',
            text: 'a',
            status: ScanPromptStatus.COMPLETED,
            result: {
              aiResponse: 'r1',
              brandMentioned: null,
              brandMentionCount: null,
              competitorsMentioned: null,
              citationDomains: ['reviews.test'],
              rankings: [
                { brandProfileId: 'comp-1', brandProfile: { name: 'OrbitDesk' }, mentionCount: 1, rank: 2 },
                { brandProfileId: 'brand-1', brandProfile: { name: 'NimbusCRM' }, mentionCount: 2, rank: 1 },
              ],
            },
          },
        ],
        brandProfiles: [
          { id: 'brand-1', role: 'BRAND', name: 'NimbusCRM', sourceUrl: 'https://nimbuscrm.test', servicesOffered: 'CRM', metaDescription: 'A CRM', summary: 'Summary', pros: ['Fast'], cons: [], status: 'COMPLETED' },
          { id: 'comp-1', role: 'COMPETITOR', name: 'OrbitDesk', sourceUrl: null, servicesOffered: null, metaDescription: null, summary: null, pros: [], cons: [], status: 'FAILED' },
        ],
      };
      getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(scan) });

      const result = await service.getScanWithAggregates('scan-2');

      // None of the classic aggregates are ever fed by a null-brandMentioned
      // row (STORY-047's AC) - all three stay empty/null exactly as they
      // would for a scan with no completed classic-flow prompts at all,
      // even though this PromptResult's own citationDomains column is
      // populated (that column is NOT NULL for both flows, KAD-26 - it's
      // just never rolled into this classic, read-time aggregate).
      expect(result!.competitorMentions).toEqual({});
      expect(result!.topCompetitor).toBeNull();
      expect(result!.citationDomains).toEqual([]);

      expect(result!.brandProfiles).toEqual(scan.brandProfiles);

      expect(result!.results).toHaveLength(1);
      expect(result!.results[0].brandMentioned).toBeNull();
      // Sorted by rank ascending, regardless of the input order above.
      expect(result!.results[0].rankings).toEqual([
        { entityName: 'NimbusCRM', mentionCount: 2, rank: 1 },
        { entityName: 'OrbitDesk', mentionCount: 1, rank: 2 },
      ]);
    });
  });
});
