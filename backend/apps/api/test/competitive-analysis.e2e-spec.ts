import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  HttpExceptionFilter,
  BrandProfile,
  BrandProfileRole,
  BrandProfileStatus,
  callOpenRouterChatCompletion,
} from '@app/common';
import { AppModule } from '../src/app.module';
// Same cross-boundary exception as scans.e2e-spec.ts (STORY-025): this is
// the one other test that deliberately reaches into apps/worker, since
// EPIC-13's 3-stage flow only actually runs end-to-end once its real
// BullMQ consumers (BrandIntelligenceProcessor, PromptRankProcessor) are
// live, and queue processing only happens in apps/worker.
import { WorkerModule } from '../../worker/src/worker.module';
import { WebsiteCrawlerService } from '../../worker/src/crawler/website-crawler.service';
import { AnalyzerClientService } from '../../worker/src/analyzer/analyzer-client.service';
import { PromptGeneratorService } from '../src/prompt-generation/prompt-generator.service';

// Every content-level failure is mocked (crawler, competitor URL lookup,
// gathering/prompt-answer AI, analyzer's rank route) - no real network
// call happens in this suite, same "mock the AI/analyzer" rule
// scans.e2e-spec.ts already follows for the classic pipeline.
//
// callOpenRouterChatCompletion is a plain function (not a NestJS provider,
// unlike WebsiteCrawlerService/AnalyzerClientService/PromptGeneratorService
// below), so it cannot be swapped via .overrideProvider() - this partial
// jest.mock() (same pattern as brand-intelligence.processor.spec.ts /
// prompt-rank.processor.spec.ts) is the only way to intercept it. Every
// other @app/common export (entities, enums, typeOrmDataSourceOptions,
// queue configs, ...) stays real via jest.requireActual(), so both
// AppModule and WorkerModule still boot against the real test Postgres.
jest.mock('@app/common', () => ({
  ...jest.requireActual('@app/common'),
  callOpenRouterChatCompletion: jest.fn(),
}));

const mockedCallOpenRouterChatCompletion = callOpenRouterChatCompletion as jest.Mock;

const GATHERED_INTELLIGENCE_JSON = JSON.stringify({
  servicesOffered: 'Widgets and gadgets for small businesses.',
  metaDescription: 'A widget company.',
  summary: 'We make widgets for everyone.',
  pros: ['Fast', 'Reliable'],
  cons: ['Limited public information'],
});

const MOCKED_RANK_ANSWER =
  'FixtureBrand is a solid choice for small teams. Acme is another popular option worth considering.';

const MOCKED_PROMPTS = [
  'What are the best tools for small business widgets?',
  'How do widget makers compare for reliability?',
  'What should I look for in a widget subscription service?',
];

// The one competitor name this suite deliberately makes unresolvable
// (STORY-048's required partial-failure case) - the mocked
// callOpenRouterChatCompletion below returns the UNKNOWN marker
// (competitor-lookup.service.ts's own convention, STORY-039) only for
// this exact name, so CompetitorLookupService.resolveCompetitorUrl()
// genuinely returns null through its own real, unmocked logic.
const UNRESOLVABLE_COMPETITOR_NAME = 'GlobexUnresolvable';

// Every call site's system instruction is distinct (brand-intelligence
// gathering, competitor URL lookup, prompt-rank's plain answer) - real,
// unmocked callers are told apart by that instruction text alone, since
// none of them pass a distinguishing `model` this mock can key off.
mockedCallOpenRouterChatCompletion.mockImplementation(
  async (_httpService: unknown, { systemInstruction, userMessage }: { systemInstruction: string; userMessage: string }) => {
    if (systemInstruction.includes('structured intelligence')) {
      return GATHERED_INTELLIGENCE_JSON;
    }
    if (systemInstruction.includes('official website URL')) {
      if (userMessage === UNRESOLVABLE_COMPETITOR_NAME) {
        return 'UNKNOWN';
      }
      return `https://${userMessage.toLowerCase().replace(/[^a-z0-9]/g, '')}.test`;
    }
    return MOCKED_RANK_ANSWER;
  },
);

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 10000,
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

describe('Competitive Analysis e2e - full 3-stage flow (gather -> generate prompts -> rank)', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const apiModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PromptGeneratorService)
      .useValue({ generatePrompts: jest.fn().mockResolvedValue(MOCKED_PROMPTS) })
      .compile();
    apiApp = apiModuleRef.createNestApplication();
    apiApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    apiApp.useGlobalFilters(new HttpExceptionFilter());
    await apiApp.init();
    dataSource = apiModuleRef.get(DataSource);

    // WebsiteCrawlerService is fully mocked (no real HTTP fetch) -
    // CompetitorLookupService is left real/unmocked, so its own
    // resolve-then-validate logic actually runs, driven by the mocked
    // callOpenRouterChatCompletion + mocked crawl() above.
    const workerModuleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(WebsiteCrawlerService)
      .useValue({
        crawl: jest.fn().mockResolvedValue([
          { url: 'https://fixture.test', pageType: 'homepage', html: '<html><body>Fixture content</body></html>' },
        ]),
      })
      .overrideProvider(AnalyzerClientService)
      .useValue({
        analyzeRank: jest.fn().mockImplementation(
          async ({ entities }: { entities: Array<{ id: string; name: string }> }) => ({
            rankings: entities.map((entity, index) => ({
              entityId: entity.id,
              mentionCount: entities.length - index,
              rank: index + 1,
            })),
            citationDomains: ['reviews.test'],
          }),
        ),
      })
      .compile();
    workerApp = workerModuleRef.createNestApplication();
    await workerApp.init();
  }, 30000);

  afterAll(async () => {
    await workerApp?.close();
    await apiApp?.close();
  });

  it('drives POST /scans/auto -> INTELLIGENCE_READY -> POST /scans/:id/prompts -> POST /scans/:id/analyze -> COMPLETED, with brandProfiles + rankings populated', async () => {
    const createResponse = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({
        website: 'https://fixture.test',
        brandName: 'FixtureBrand',
        competitors: ['Acme', 'Globex'],
      })
      .expect(201);

    expect(createResponse.body.status).toBe('GATHERING_INTELLIGENCE');
    const { scanId } = createResponse.body;

    let scanBody: Record<string, unknown> = {};
    await waitFor(async () => {
      const response = await request(apiApp.getHttpServer()).get(`/scans/${scanId}`).expect(200);
      scanBody = response.body;
      return scanBody.status === 'INTELLIGENCE_READY';
    });

    const brandProfiles = scanBody.brandProfiles as Array<Record<string, unknown>>;
    expect(brandProfiles).toHaveLength(3);
    expect(brandProfiles.every((profile) => profile.status === BrandProfileStatus.COMPLETED)).toBe(true);

    const promptsResponse = await request(apiApp.getHttpServer())
      .post(`/scans/${scanId}/prompts`)
      .expect(201);
    expect(promptsResponse.body.prompts).toEqual(MOCKED_PROMPTS);

    const analyzeResponse = await request(apiApp.getHttpServer())
      .post(`/scans/${scanId}/analyze`)
      .expect(201);
    expect(analyzeResponse.body.status).toBe('PROCESSING');

    await waitFor(async () => {
      const response = await request(apiApp.getHttpServer()).get(`/scans/${scanId}`).expect(200);
      scanBody = response.body;
      return scanBody.status === 'COMPLETED';
    });

    const results = scanBody.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(3);
    for (const result of results) {
      // KAD-27 - this flow never populates the classic columns.
      expect(result.brandMentioned).toBeNull();
      expect(result.brandMentionCount).toBeNull();
      expect(result.competitorsMentioned).toBeNull();

      const rankings = result.rankings as Array<Record<string, unknown>>;
      expect(rankings).toHaveLength(3);
      expect(rankings.map((r) => r.entityName).sort()).toEqual(['Acme', 'FixtureBrand', 'Globex']);
      expect(rankings.map((r) => r.rank).sort()).toEqual([1, 2, 3]);
    }
  }, 20000);

  it('marks an unresolvable competitor FAILED while the scan still reaches INTELLIGENCE_READY and completes normally otherwise', async () => {
    const createResponse = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({
        website: 'https://fixture.test',
        brandName: 'FixtureBrand',
        competitors: ['Acme', UNRESOLVABLE_COMPETITOR_NAME],
      })
      .expect(201);
    const { scanId } = createResponse.body;

    await waitFor(async () => {
      const profiles = await dataSource.getRepository(BrandProfile).find({ where: { scanId } });
      return profiles.length === 3 && profiles.every((profile) => profile.status !== BrandProfileStatus.PENDING);
    });

    const profiles = await dataSource.getRepository(BrandProfile).find({ where: { scanId } });
    expect(
      profiles.find((profile) => profile.role === BrandProfileRole.BRAND)?.status,
    ).toBe(BrandProfileStatus.COMPLETED);
    expect(
      profiles.find((profile) => profile.name === 'Acme')?.status,
    ).toBe(BrandProfileStatus.COMPLETED);
    expect(
      profiles.find((profile) => profile.name === UNRESOLVABLE_COMPETITOR_NAME)?.status,
    ).toBe(BrandProfileStatus.FAILED);

    const scanResponse = await request(apiApp.getHttpServer()).get(`/scans/${scanId}`).expect(200);
    expect(scanResponse.body.status).toBe('INTELLIGENCE_READY');

    // The scan proceeds normally from here, exactly like the fully
    // successful case above - a FAILED competitor never blocks prompt
    // generation (only the BRAND row's own status is guarded, STORY-043)
    // or ranked analysis (PromptRankProcessor sends every BrandProfile
    // row for the scan to the analyzer regardless of status, STORY-046).
    await request(apiApp.getHttpServer()).post(`/scans/${scanId}/prompts`).expect(201);
    await request(apiApp.getHttpServer()).post(`/scans/${scanId}/analyze`).expect(201);

    let finalBody: Record<string, unknown> = {};
    await waitFor(async () => {
      const response = await request(apiApp.getHttpServer()).get(`/scans/${scanId}`).expect(200);
      finalBody = response.body;
      return finalBody.status === 'COMPLETED';
    });

    const results = finalBody.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(3);
    for (const result of results) {
      const rankings = result.rankings as Array<Record<string, unknown>>;
      // All 3 entities are still ranked, including the FAILED competitor.
      expect(rankings).toHaveLength(3);
      expect(rankings.map((r) => r.entityName).sort()).toEqual(
        ['Acme', 'FixtureBrand', UNRESOLVABLE_COMPETITOR_NAME].sort(),
      );
    }
  }, 20000);
});
