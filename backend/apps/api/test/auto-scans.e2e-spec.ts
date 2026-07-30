import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '@app/common';
import { AppModule } from '../src/app.module';
import { WebsiteCrawlerService } from '../src/crawler/website-crawler.service';
import { PromptGeneratorService } from '../src/prompt-generation/prompt-generator.service';
import { CrawledPage } from '../src/crawler/crawled-page.interface';
// Same api/worker-boundary-crossing pattern as scans.e2e-spec.ts (STORY-025) -
// one of this suite's cases (the fully-auto one) drives a real scan all the
// way to COMPLETED via the unmodified worker pipeline, to prove /scans/auto
// isn't just "creates a row" but genuinely produces a scannable scan.
import { WorkerModule } from '../../worker/src/worker.module';
import { OpenRouterService } from '../../worker/src/ai/openrouter.service';
import { AnalyzerClientService } from '../../worker/src/analyzer/analyzer-client.service';

const MOCKED_AI_RESPONSE =
  'Fixture Brand is a great fit. Source: https://reviews.test/fixture-brand';
const MOCKED_ANALYSIS = {
  brandMentioned: true,
  brandMentionCount: 1,
  competitorsMentioned: [],
  citationDomains: ['reviews.test'],
};

// A fixture homepage with a deterministic og:site_name - detectBrandName()
// (a pure function, never mocked here) always resolves this to "Fixture
// Brand", so brand-detection assertions are exact, not "some string".
const FIXTURE_HOMEPAGE_HTML = `
  <html>
    <head><meta property="og:site_name" content="Fixture Brand" /></head>
    <body><h1>Fixture Brand</h1><p>We make fixtures.</p></body>
  </html>
`;
const FIXTURE_PAGES: CrawledPage[] = [
  { url: 'https://fixture-brand.test', pageType: 'homepage', html: FIXTURE_HOMEPAGE_HTML },
];
const GENERATED_PROMPTS = [
  'What fixture providers exist for testing?',
  'Is Fixture Brand good for automated test suites?',
];

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor: condition did not become true within ${timeoutMs}ms`);
}

describe('Auto Scans e2e - POST /scans/auto 4-case branching + 422 failure handling', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let crawl: jest.Mock;
  let generatePrompts: jest.Mock;

  const baseBody = {
    website: 'https://fixture-brand.test',
    competitors: ['Acme'],
  };

  beforeAll(async () => {
    // apps/api - real HTTP server, real (host-published) test Postgres +
    // Redis, only the two external-crawl/AI-dependent services mocked -
    // WebsiteCrawlerService (no real network fetch) and PromptGeneratorService
    // (no real OpenRouter call for prompt generation).
    const apiModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WebsiteCrawlerService)
      .useValue({ crawl: jest.fn() })
      .overrideProvider(PromptGeneratorService)
      .useValue({ generatePrompts: jest.fn() })
      .compile();
    apiApp = apiModuleRef.createNestApplication();
    apiApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    apiApp.useGlobalFilters(new HttpExceptionFilter());
    await apiApp.init();

    crawl = apiApp.get(WebsiteCrawlerService).crawl;
    generatePrompts = apiApp.get(PromptGeneratorService).generatePrompts;

    // apps/worker - the actual BullMQ consumer, untouched, with only the
    // two external-network AI services mocked (same as scans.e2e-spec.ts).
    const workerModuleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(OpenRouterService)
      .useValue({ generate: jest.fn().mockResolvedValue(MOCKED_AI_RESPONSE) })
      .overrideProvider(AnalyzerClientService)
      .useValue({ analyze: jest.fn().mockResolvedValue(MOCKED_ANALYSIS) })
      .compile();
    workerApp = workerModuleRef.createNestApplication();
    await workerApp.init();
  }, 30000);

  afterAll(async () => {
    await workerApp?.close();
    await apiApp?.close();
  });

  beforeEach(() => {
    crawl.mockReset();
    generatePrompts.mockReset();
  });

  it('both brandName and prompts supplied: no crawl happens, scan created with the supplied values', async () => {
    const response = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({ ...baseBody, brandName: 'Fixture Brand', prompts: ['p1', 'p2', 'p3'] })
      .expect(201);

    expect(response.body.status).toBe('QUEUED');
    expect(crawl).not.toHaveBeenCalled();
    expect(generatePrompts).not.toHaveBeenCalled();
  });

  it('brandName omitted, prompts supplied: crawls once, detects the brand from the fixture HTML', async () => {
    crawl.mockResolvedValue(FIXTURE_PAGES);

    const createResponse = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({ ...baseBody, prompts: ['p1', 'p2', 'p3'] })
      .expect(201);

    expect(crawl).toHaveBeenCalledTimes(1);
    expect(generatePrompts).not.toHaveBeenCalled();

    const detail = await request(apiApp.getHttpServer())
      .get(`/scans/${createResponse.body.scanId}`)
      .expect(200);
    expect(detail.body.brandName).toBe('Fixture Brand');
    expect(detail.body.totalPrompts).toBe(3);
  });

  it('brandName supplied, prompts omitted: crawls once, uses the supplied brand, generates exactly 2 prompts', async () => {
    crawl.mockResolvedValue(FIXTURE_PAGES);
    generatePrompts.mockResolvedValue(GENERATED_PROMPTS);

    const createResponse = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({ ...baseBody, brandName: 'Fixture Brand' })
      .expect(201);

    expect(crawl).toHaveBeenCalledTimes(1);
    expect(generatePrompts).toHaveBeenCalledTimes(1);

    const detail = await request(apiApp.getHttpServer())
      .get(`/scans/${createResponse.body.scanId}`)
      .expect(200);
    expect(detail.body.brandName).toBe('Fixture Brand');
    expect(detail.body.totalPrompts).toBe(2);
  });

  it('both omitted: crawls exactly once for both brand detection and prompt generation, and the scan completes via the worker', async () => {
    crawl.mockResolvedValue(FIXTURE_PAGES);
    generatePrompts.mockResolvedValue(GENERATED_PROMPTS);

    const createResponse = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send(baseBody)
      .expect(201);

    expect(crawl).toHaveBeenCalledTimes(1);
    expect(generatePrompts).toHaveBeenCalledTimes(1);

    const { scanId } = createResponse.body;
    let finalBody: Record<string, unknown> = {};
    await waitFor(async () => {
      const response = await request(apiApp.getHttpServer()).get(`/scans/${scanId}`).expect(200);
      finalBody = response.body;
      return finalBody.status === 'COMPLETED';
    });

    expect(finalBody).toMatchObject({
      brandName: 'Fixture Brand',
      status: 'COMPLETED',
      totalPrompts: 2,
      processedPrompts: 2,
      visibilityScore: 100,
    });
  }, 20000);

  it('crawl failure: returns 422 with the exact specified message, and never creates a scan', async () => {
    crawl.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send(baseBody)
      .expect(422);

    expect(response.body.message).toBe(
      'Unable to extract sufficient brand information from the website.',
    );
  });

  it('prompt-generation failure: returns 422 with a distinct message, and never creates a scan', async () => {
    crawl.mockResolvedValue(FIXTURE_PAGES);
    generatePrompts.mockRejectedValue(new Error('bad json'));

    const response = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send(baseBody)
      .expect(422);

    expect(response.body.message).toBe(
      'Unable to generate prompts from the website content.',
    );
  });
});
