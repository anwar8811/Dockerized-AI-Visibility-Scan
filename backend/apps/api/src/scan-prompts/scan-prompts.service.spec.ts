import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Scan, Prompt, BrandProfile, BrandProfileRole, BrandProfileStatus, ScanPromptStatus } from '@app/common';
import { ScanPromptsService } from './scan-prompts.service';

describe('ScanPromptsService', () => {
  const scanId = 'scan-1';

  function buildService() {
    const scanFindOneBy = jest.fn();
    const brandProfileFindOneByOrFail = jest.fn();
    const scanRepository = { findOneBy: scanFindOneBy };
    const brandProfileRepository = { findOneByOrFail: brandProfileFindOneByOrFail };

    const getRepository = jest.fn((entity: unknown) => {
      if (entity === Scan) return scanRepository;
      if (entity === BrandProfile) return brandProfileRepository;
      throw new Error(`unexpected repository requested: ${entity}`);
    });

    const manager = { create: jest.fn((_entity, data) => data), save: jest.fn(), update: jest.fn() };
    const dataSource = {
      getRepository,
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
    };

    const promptGeneratorService = { generatePrompts: jest.fn() };

    const service = new ScanPromptsService(dataSource as any, promptGeneratorService as any);

    return { service, scanFindOneBy, brandProfileFindOneByOrFail, manager, dataSource, promptGeneratorService };
  }

  const completedBrandProfile = {
    id: 'profile-1',
    scanId,
    role: BrandProfileRole.BRAND,
    name: 'Example Co',
    servicesOffered: 'Widgets for small teams.',
    metaDescription: 'A widget company.',
    summary: 'Example Co sells widgets.',
    status: BrandProfileStatus.COMPLETED,
  };

  const GENERATED_PROMPTS = [
    'What widget brands exist for small teams?',
    'Which widget provider is best for automation?',
    'How do widget providers compare on price?',
  ];

  it('generates exactly 3 prompts, persists them, and marks the scan PROMPTS_GENERATED', async () => {
    const { service, scanFindOneBy, brandProfileFindOneByOrFail, manager, promptGeneratorService } =
      buildService();
    scanFindOneBy.mockResolvedValue({ id: scanId, status: ScanPromptStatus.INTELLIGENCE_READY });
    brandProfileFindOneByOrFail.mockResolvedValue(completedBrandProfile);
    promptGeneratorService.generatePrompts.mockResolvedValue(GENERATED_PROMPTS);

    const result = await service.create(scanId);

    expect(promptGeneratorService.generatePrompts).toHaveBeenCalledWith({
      name: 'Example Co',
      servicesOffered: 'Widgets for small teams.',
      metaDescription: 'A widget company.',
      summary: 'Example Co sells widgets.',
    });
    expect(result).toEqual({ scanId, prompts: GENERATED_PROMPTS });
    expect(manager.create).toHaveBeenCalledTimes(3);
    GENERATED_PROMPTS.forEach((text) => {
      expect(manager.create).toHaveBeenCalledWith(Prompt, { scanId, text });
    });
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(Scan, scanId, {
      totalPrompts: 3,
      status: ScanPromptStatus.PROMPTS_GENERATED,
    });
  });

  it('returns 404 when the scan does not exist', async () => {
    const { service, scanFindOneBy } = buildService();
    scanFindOneBy.mockResolvedValue(null);

    await expect(service.create(scanId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 409 and generates nothing when the scan is still GATHERING_INTELLIGENCE', async () => {
    const { service, scanFindOneBy, promptGeneratorService, manager } = buildService();
    scanFindOneBy.mockResolvedValue({ id: scanId, status: ScanPromptStatus.GATHERING_INTELLIGENCE });

    await expect(service.create(scanId)).rejects.toBeInstanceOf(ConflictException);
    expect(promptGeneratorService.generatePrompts).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns 409 and generates nothing when prompts were already generated (called twice)', async () => {
    const { service, scanFindOneBy, promptGeneratorService } = buildService();
    scanFindOneBy.mockResolvedValue({ id: scanId, status: ScanPromptStatus.PROMPTS_GENERATED });

    await expect(service.create(scanId)).rejects.toBeInstanceOf(ConflictException);
    expect(promptGeneratorService.generatePrompts).not.toHaveBeenCalled();
  });

  it("returns 422 and never calls the AI when the BRAND profile's own gathering FAILED", async () => {
    const { service, scanFindOneBy, brandProfileFindOneByOrFail, promptGeneratorService } =
      buildService();
    scanFindOneBy.mockResolvedValue({ id: scanId, status: ScanPromptStatus.INTELLIGENCE_READY });
    brandProfileFindOneByOrFail.mockResolvedValue({
      ...completedBrandProfile,
      status: BrandProfileStatus.FAILED,
      servicesOffered: null,
    });

    await expect(service.create(scanId)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(promptGeneratorService.generatePrompts).not.toHaveBeenCalled();
  });

  it('returns 422 and creates no Prompt rows when AI generation fails, leaving the scan status unchanged', async () => {
    const { service, scanFindOneBy, brandProfileFindOneByOrFail, promptGeneratorService, manager } =
      buildService();
    scanFindOneBy.mockResolvedValue({ id: scanId, status: ScanPromptStatus.INTELLIGENCE_READY });
    brandProfileFindOneByOrFail.mockResolvedValue(completedBrandProfile);
    promptGeneratorService.generatePrompts.mockRejectedValue(new Error('bad json'));

    await expect(service.create(scanId)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });
});
