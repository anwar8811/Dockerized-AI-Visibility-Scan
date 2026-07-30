import { UnprocessableEntityException } from '@nestjs/common';
import { AutoScansService } from './auto-scans.service';
import { detectBrandName } from '../crawler/brand-detector';
import { CreateAutoScanDto } from './dto/create-auto-scan.dto';
import { CrawledPage } from '../crawler/crawled-page.interface';

jest.mock('../crawler/brand-detector', () => ({
  detectBrandName: jest.fn(),
}));

const mockedDetectBrandName = detectBrandName as jest.Mock;

describe('AutoScansService', () => {
  function buildService() {
    const crawlerService = { crawl: jest.fn() };
    const promptGeneratorService = { generatePrompts: jest.fn() };
    const scansService = {
      createFromResolvedInputs: jest.fn().mockResolvedValue({ scanId: 'scan-1', status: 'QUEUED' }),
    };
    const service = new AutoScansService(
      crawlerService as any,
      promptGeneratorService as any,
      scansService as any,
    );
    return { service, crawlerService, promptGeneratorService, scansService };
  }

  const homepage: CrawledPage = {
    url: 'https://example.test',
    pageType: 'homepage',
    html: '<html><body>Example</body></html>',
  };
  const pages: CrawledPage[] = [homepage];

  const baseDto: CreateAutoScanDto = {
    website: 'https://example.test',
    competitors: ['Acme'],
  };

  beforeEach(() => {
    mockedDetectBrandName.mockReset();
  });

  it('both brandName and prompts supplied: no crawl happens, scan created with the supplied values', async () => {
    const { service, crawlerService, promptGeneratorService, scansService } = buildService();
    const dto: CreateAutoScanDto = { ...baseDto, brandName: 'Example', prompts: ['p1', 'p2', 'p3'] };

    const result = await service.create(dto);

    expect(crawlerService.crawl).not.toHaveBeenCalled();
    expect(mockedDetectBrandName).not.toHaveBeenCalled();
    expect(promptGeneratorService.generatePrompts).not.toHaveBeenCalled();
    expect(scansService.createFromResolvedInputs).toHaveBeenCalledWith(
      'Example',
      dto.website,
      dto.competitors,
      ['p1', 'p2', 'p3'],
    );
    expect(result).toEqual({ scanId: 'scan-1', status: 'QUEUED' });
  });

  it('brandName omitted, prompts supplied: crawls once, detects the brand, uses the supplied prompts as-is', async () => {
    const { service, crawlerService, promptGeneratorService, scansService } = buildService();
    crawlerService.crawl.mockResolvedValue(pages);
    mockedDetectBrandName.mockReturnValue('DetectedName');
    const dto: CreateAutoScanDto = { ...baseDto, prompts: ['p1', 'p2', 'p3'] };

    await service.create(dto);

    expect(crawlerService.crawl).toHaveBeenCalledTimes(1);
    expect(crawlerService.crawl).toHaveBeenCalledWith(dto.website);
    expect(mockedDetectBrandName).toHaveBeenCalledWith(homepage);
    expect(promptGeneratorService.generatePrompts).not.toHaveBeenCalled();
    expect(scansService.createFromResolvedInputs).toHaveBeenCalledWith(
      'DetectedName',
      dto.website,
      dto.competitors,
      ['p1', 'p2', 'p3'],
    );
  });

  it('brandName supplied, prompts omitted: crawls once, uses the supplied brand as-is, generates prompts', async () => {
    const { service, crawlerService, promptGeneratorService, scansService } = buildService();
    crawlerService.crawl.mockResolvedValue(pages);
    promptGeneratorService.generatePrompts.mockResolvedValue(['g1', 'g2']);
    const dto: CreateAutoScanDto = { ...baseDto, brandName: 'Example' };

    await service.create(dto);

    expect(crawlerService.crawl).toHaveBeenCalledTimes(1);
    expect(mockedDetectBrandName).not.toHaveBeenCalled();
    expect(promptGeneratorService.generatePrompts).toHaveBeenCalledWith(pages);
    expect(scansService.createFromResolvedInputs).toHaveBeenCalledWith(
      'Example',
      dto.website,
      dto.competitors,
      ['g1', 'g2'],
    );
  });

  it('both brandName and prompts omitted: crawls exactly once, the same result feeds both brand detection and prompt generation', async () => {
    const { service, crawlerService, promptGeneratorService, scansService } = buildService();
    crawlerService.crawl.mockResolvedValue(pages);
    mockedDetectBrandName.mockReturnValue('DetectedName');
    promptGeneratorService.generatePrompts.mockResolvedValue(['g1', 'g2']);
    const dto: CreateAutoScanDto = { ...baseDto };

    await service.create(dto);

    expect(crawlerService.crawl).toHaveBeenCalledTimes(1);
    expect(mockedDetectBrandName).toHaveBeenCalledWith(homepage);
    expect(promptGeneratorService.generatePrompts).toHaveBeenCalledWith(pages);
    expect(scansService.createFromResolvedInputs).toHaveBeenCalledWith(
      'DetectedName',
      dto.website,
      dto.competitors,
      ['g1', 'g2'],
    );
  });

  it('crawl failure: throws 422 with the exact specified message, and never creates the scan', async () => {
    const { service, crawlerService, scansService } = buildService();
    crawlerService.crawl.mockRejectedValue(new Error('ECONNREFUSED'));
    const dto: CreateAutoScanDto = { ...baseDto };

    const promise = service.create(dto);

    await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(promise).rejects.toThrow(
      'Unable to extract sufficient brand information from the website.',
    );
    expect(scansService.createFromResolvedInputs).not.toHaveBeenCalled();
  });

  it('prompt-generation failure: throws 422 with a distinct message, and never creates the scan', async () => {
    const { service, crawlerService, promptGeneratorService, scansService } = buildService();
    crawlerService.crawl.mockResolvedValue(pages);
    mockedDetectBrandName.mockReturnValue('DetectedName');
    promptGeneratorService.generatePrompts.mockRejectedValue(new Error('bad json'));
    const dto: CreateAutoScanDto = { ...baseDto };

    const promise = service.create(dto);

    await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(promise).rejects.toThrow(
      'Unable to generate prompts from the website content.',
    );
    expect(scansService.createFromResolvedInputs).not.toHaveBeenCalled();
  });
});
