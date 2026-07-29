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
        relations: { prompts: { result: true } },
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
            },
          },
          {
            id: 'prompt-2',
            text: 'b',
            status: ScanPromptStatus.QUEUED,
            result: null,
          },
        ],
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
          },
        ],
        createdAt: scan.createdAt,
        updatedAt: scan.updatedAt,
        completedAt: scan.completedAt,
      });
    });
  });
});
