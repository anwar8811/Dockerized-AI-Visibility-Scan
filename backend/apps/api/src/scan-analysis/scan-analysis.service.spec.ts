import { ConflictException, NotFoundException } from '@nestjs/common';
import { Scan, ScanPromptStatus, PROMPT_RANK_JOB_NAME, buildPromptRankJobId } from '@app/common';
import { ScanAnalysisService } from './scan-analysis.service';

describe('ScanAnalysisService', () => {
  const scanId = 'scan-1';

  function buildService() {
    const manager = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    const promptRankQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const service = new ScanAnalysisService(dataSource as any, promptRankQueue as any);

    return { service, manager, dataSource, promptRankQueue };
  }

  const prompts = [{ id: 'prompt-1' }, { id: 'prompt-2' }, { id: 'prompt-3' }];

  it('enqueues one deterministic-jobId prompt-rank job per Prompt row and marks the scan PROCESSING', async () => {
    const { service, manager, promptRankQueue } = buildService();
    manager.findOne.mockResolvedValue({ id: scanId, status: ScanPromptStatus.PROMPTS_GENERATED, prompts });

    const result = await service.create(scanId);

    expect(manager.update).toHaveBeenCalledWith(Scan, scanId, { status: ScanPromptStatus.PROCESSING });
    expect(promptRankQueue.add).toHaveBeenCalledTimes(3);
    prompts.forEach((prompt) => {
      expect(promptRankQueue.add).toHaveBeenCalledWith(
        PROMPT_RANK_JOB_NAME,
        { scanId, promptId: prompt.id },
        {
          jobId: buildPromptRankJobId(scanId, prompt.id),
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    });
    expect(result).toEqual({ scanId, status: ScanPromptStatus.PROCESSING });
  });

  it('returns 404 when the scan does not exist', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValue(null);

    await expect(service.create(scanId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 409 and enqueues nothing when the scan is still INTELLIGENCE_READY (prompts not generated yet)', async () => {
    const { service, manager, promptRankQueue } = buildService();
    manager.findOne.mockResolvedValue({ id: scanId, status: ScanPromptStatus.INTELLIGENCE_READY, prompts: [] });

    await expect(service.create(scanId)).rejects.toBeInstanceOf(ConflictException);
    expect(promptRankQueue.add).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('returns 409 and never re-enqueues when analysis was already started (status PROCESSING)', async () => {
    const { service, manager, promptRankQueue } = buildService();
    manager.findOne.mockResolvedValue({ id: scanId, status: ScanPromptStatus.PROCESSING, prompts });

    await expect(service.create(scanId)).rejects.toBeInstanceOf(ConflictException);
    expect(promptRankQueue.add).not.toHaveBeenCalled();
  });

  it('returns 409 when analysis already completed (status COMPLETED)', async () => {
    const { service, manager, promptRankQueue } = buildService();
    manager.findOne.mockResolvedValue({ id: scanId, status: ScanPromptStatus.COMPLETED, prompts });

    await expect(service.create(scanId)).rejects.toBeInstanceOf(ConflictException);
    expect(promptRankQueue.add).not.toHaveBeenCalled();
  });
});
