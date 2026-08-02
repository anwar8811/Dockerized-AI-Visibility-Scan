import { Job } from 'bullmq';
import {
  BrandProfile,
  BrandProfileRole,
  BrandProfileStatus,
  ScanPromptStatus,
  CrawledPage,
  callOpenRouterChatCompletion,
} from '@app/common';
import { BrandIntelligenceProcessor } from './brand-intelligence.processor';

// Partial mock: unlike PromptScanProcessor (which only ever touches entity
// classes/enums from @app/common, all real values) or CompetitorLookupService's
// own spec (which only ever needs callOpenRouterChatCompletion mocked), this
// processor needs BOTH - real BrandProfile/BrandProfileRole/BrandProfileStatus/
// ScanPromptStatus values (used directly in assertions and in the
// @Processor(BRAND_INTELLIGENCE_QUEUE) class decorator at module-load time)
// AND a mocked callOpenRouterChatCompletion. jest.requireActual() keeps every
// real export, overriding only the one function.
jest.mock('@app/common', () => ({
  ...jest.requireActual('@app/common'),
  callOpenRouterChatCompletion: jest.fn(),
}));

const mockedCallOpenRouterChatCompletion = callOpenRouterChatCompletion as jest.Mock;

describe('BrandIntelligenceProcessor', () => {
  const scanId = 'scan-1';
  const brandProfileId = 'profile-1';

  const homepagePage: CrawledPage = {
    url: 'https://example.test',
    pageType: 'homepage',
    html: '<html><body>Content</body></html>',
  };

  const GATHERED_JSON = JSON.stringify({
    servicesOffered: 'Widgets and gadgets.',
    metaDescription: 'A widget company.',
    summary: 'We make widgets for everyone.',
    pros: ['Fast', 'Reliable'],
    cons: ['Limited public information'],
  });

  function buildProcessor() {
    const brandProfileRepository = { findOneByOrFail: jest.fn() };
    const manager = { update: jest.fn(), query: jest.fn() };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    const crawlerService = { crawl: jest.fn() };
    const competitorLookupService = { resolveCompetitorUrl: jest.fn() };

    const processor = new BrandIntelligenceProcessor(
      brandProfileRepository as any,
      dataSource as any,
      {} as any,
      crawlerService as any,
      competitorLookupService as any,
    );

    return { processor, brandProfileRepository, manager, dataSource, crawlerService, competitorLookupService };
  }

  function makeJob(): Job<{ scanId: string; brandProfileId: string }> {
    return { data: { scanId, brandProfileId } } as Job<{
      scanId: string;
      brandProfileId: string;
    }>;
  }

  beforeEach(() => {
    mockedCallOpenRouterChatCompletion.mockReset();
  });

  it('gathers intelligence successfully for a competitor whose URL resolves and crawls', async () => {
    const { processor, brandProfileRepository, manager, crawlerService, competitorLookupService } =
      buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.COMPETITOR,
      name: 'Competitor Inc',
      sourceUrl: null,
    });
    competitorLookupService.resolveCompetitorUrl.mockResolvedValue('https://competitor.test');
    crawlerService.crawl.mockResolvedValue([homepagePage]);
    mockedCallOpenRouterChatCompletion.mockResolvedValue(GATHERED_JSON);

    await processor.process(makeJob());

    expect(competitorLookupService.resolveCompetitorUrl).toHaveBeenCalledWith('Competitor Inc');
    expect(crawlerService.crawl).toHaveBeenCalledWith('https://competitor.test');
    expect(manager.update).toHaveBeenCalledWith(
      BrandProfile,
      brandProfileId,
      expect.objectContaining({
        name: 'Competitor Inc',
        sourceUrl: 'https://competitor.test',
        servicesOffered: 'Widgets and gadgets.',
        metaDescription: 'A widget company.',
        summary: 'We make widgets for everyone.',
        pros: ['Fast', 'Reliable'],
        cons: ['Limited public information'],
        status: BrandProfileStatus.COMPLETED,
      }),
    );
  });

  it('marks the row FAILED (no crawl attempted) when the competitor URL cannot be resolved', async () => {
    const { processor, brandProfileRepository, manager, crawlerService, competitorLookupService } =
      buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.COMPETITOR,
      name: 'Ghost Co',
      sourceUrl: null,
    });
    competitorLookupService.resolveCompetitorUrl.mockResolvedValue(null);

    await expect(processor.process(makeJob())).resolves.toBeUndefined();

    expect(crawlerService.crawl).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(BrandProfile, brandProfileId, {
      status: BrandProfileStatus.FAILED,
    });
  });

  it('marks the row FAILED when a resolved competitor URL fails to crawl', async () => {
    const { processor, brandProfileRepository, manager, crawlerService, competitorLookupService } =
      buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.COMPETITOR,
      name: 'Ghost Co',
      sourceUrl: null,
    });
    competitorLookupService.resolveCompetitorUrl.mockResolvedValue('https://ghost.test');
    crawlerService.crawl.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(processor.process(makeJob())).resolves.toBeUndefined();

    expect(manager.update).toHaveBeenCalledWith(BrandProfile, brandProfileId, {
      status: BrandProfileStatus.FAILED,
    });
  });

  it('marks the row FAILED, with no field guessed, when the AI summarization call returns unparseable output', async () => {
    const { processor, brandProfileRepository, manager, crawlerService } = buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.BRAND,
      name: 'Example',
      sourceUrl: 'https://example.test',
    });
    crawlerService.crawl.mockResolvedValue([homepagePage]);
    mockedCallOpenRouterChatCompletion.mockResolvedValue('not valid json');

    await expect(processor.process(makeJob())).resolves.toBeUndefined();

    expect(manager.update).toHaveBeenCalledWith(BrandProfile, brandProfileId, {
      status: BrandProfileStatus.FAILED,
    });
  });

  it('marks the row FAILED when the AI returns valid JSON but missing a required field', async () => {
    const { processor, brandProfileRepository, manager, crawlerService } = buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.BRAND,
      name: 'Example',
      sourceUrl: 'https://example.test',
    });
    crawlerService.crawl.mockResolvedValue([homepagePage]);
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      JSON.stringify({ servicesOffered: 'Widgets.', metaDescription: 'A co.', summary: 'We do things.' }),
    );

    await expect(processor.process(makeJob())).resolves.toBeUndefined();

    expect(manager.update).toHaveBeenCalledWith(BrandProfile, brandProfileId, {
      status: BrandProfileStatus.FAILED,
    });
  });

  it("resolves the BRAND row's name via detectBrandName when brandName was omitted", async () => {
    const { processor, brandProfileRepository, manager, crawlerService } = buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.BRAND,
      name: null,
      sourceUrl: 'https://elegant.test',
    });
    const homepage: CrawledPage = {
      url: 'https://elegant.test',
      pageType: 'homepage',
      html: '<html><head><meta property="og:site_name" content="Elegant"></head><body></body></html>',
    };
    crawlerService.crawl.mockResolvedValue([homepage]);
    mockedCallOpenRouterChatCompletion.mockResolvedValue(GATHERED_JSON);

    await processor.process(makeJob());

    expect(manager.update).toHaveBeenCalledWith(
      BrandProfile,
      brandProfileId,
      expect.objectContaining({ name: 'Elegant' }),
    );
  });

  it('runs the atomic INTELLIGENCE_READY completion check (NOT EXISTS on PENDING rows) after a successful update', async () => {
    const { processor, brandProfileRepository, manager, crawlerService } = buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.BRAND,
      name: 'Example',
      sourceUrl: 'https://example.test',
    });
    crawlerService.crawl.mockResolvedValue([homepagePage]);
    mockedCallOpenRouterChatCompletion.mockResolvedValue(GATHERED_JSON);

    await processor.process(makeJob());

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), [
      scanId,
      ScanPromptStatus.INTELLIGENCE_READY,
      ScanPromptStatus.GATHERING_INTELLIGENCE,
      BrandProfileStatus.PENDING,
    ]);
  });

  it('runs the same atomic completion check after a FAILED update too', async () => {
    const { processor, brandProfileRepository, manager, competitorLookupService } = buildProcessor();
    brandProfileRepository.findOneByOrFail.mockResolvedValue({
      id: brandProfileId,
      role: BrandProfileRole.COMPETITOR,
      name: 'Ghost Co',
      sourceUrl: null,
    });
    competitorLookupService.resolveCompetitorUrl.mockResolvedValue(null);

    await processor.process(makeJob());

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), [
      scanId,
      ScanPromptStatus.INTELLIGENCE_READY,
      ScanPromptStatus.GATHERING_INTELLIGENCE,
      BrandProfileStatus.PENDING,
    ]);
  });

  describe('onJobFailed', () => {
    it('logs "retry scheduled" while attempts remain', () => {
      const { processor } = buildProcessor();
      const job = {
        data: { scanId, brandProfileId },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as unknown as Job<{ scanId: string; brandProfileId: string }>;

      expect(() => processor.onJobFailed(job)).not.toThrow();
    });
  });
});
