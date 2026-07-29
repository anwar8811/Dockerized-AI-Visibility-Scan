import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '@app/common';
import { AppModule } from '../src/app.module';
// This is the one test in the repo that deliberately reaches across the
// api/worker boundary: STORY-025's AC requires a *true* end-to-end run
// (Create Scan -> Queue Job -> Process Prompt -> Analyze Response ->
// Store Result -> Calculate Score -> Completed Scan), and queue
// processing only happens in apps/worker. There is no way to exercise
// that chain from apps/api alone.
import { WorkerModule } from '../../worker/src/worker.module';
import { OpenRouterService } from '../../worker/src/ai/openrouter.service';
import { AnalyzerClientService } from '../../worker/src/analyzer/analyzer-client.service';

// Per the brief's own "mock Qwen where necessary for automated testing"
// instruction (read as "mock the AI provider") - both external HTTP
// dependencies are replaced with fixed, deterministic mocks so this test
// never makes a real network call and its assertions can check exact
// values, not just "some value came back".
const MOCKED_AI_RESPONSE =
  'NimbusCRM is a great fit. Compared with OrbitDesk, it is more lightweight. Source: https://reviews.test/nimbuscrm';
const MOCKED_ANALYSIS = {
  brandMentioned: true,
  brandMentionCount: 2,
  competitorsMentioned: ['OrbitDesk'],
  citationDomains: ['reviews.test'],
};

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

describe('Scans e2e - full Create -> Queue -> Process -> Analyze -> Store -> Score -> Completed flow', () => {
  let apiApp: INestApplication;
  let workerApp: INestApplication;

  beforeAll(async () => {
    // apps/api - a real HTTP server, against the real (host-published) test
    // Postgres + Redis started via `docker compose up -d postgres redis`.
    const apiModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    apiApp = apiModuleRef.createNestApplication();
    apiApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    apiApp.useGlobalFilters(new HttpExceptionFilter());
    await apiApp.init();

    // apps/worker - the actual BullMQ consumer (PromptScanProcessor,
    // untouched), pointed at the same test Postgres + Redis, with only the
    // two external-network services mocked.
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

  it('drives a full scan from creation through to a COMPLETED, fully-scored result', async () => {
    const createResponse = await request(apiApp.getHttpServer())
      .post('/scans')
      .send({
        brandName: 'NimbusCRM',
        website: 'https://nimbuscrm.test',
        competitors: ['OrbitDesk', 'ClientLoop'],
        prompts: [
          'What are the best CRM tools for small agencies?',
          'What CRM is good for managing client follow-ups?',
          'What are good lightweight CRM tools for small teams?',
        ],
      })
      .expect(201);

    expect(createResponse.body.status).toBe('QUEUED');
    const { scanId } = createResponse.body;

    let finalBody: Record<string, unknown> = {};
    await waitFor(async () => {
      const response = await request(apiApp.getHttpServer())
        .get(`/scans/${scanId}`)
        .expect(200);
      finalBody = response.body;
      return finalBody.status === 'COMPLETED';
    });

    // Every value below is exact and derivable from MOCKED_ANALYSIS - all
    // 3 prompts get the identical mocked analysis, so:
    //   visibilityScore = round(3 brand-mentioned / 3 total * 100) = 100
    //   competitorMentions.OrbitDesk = 3 (mentioned in every mocked result)
    expect(finalBody).toMatchObject({
      id: scanId,
      status: 'COMPLETED',
      totalPrompts: 3,
      processedPrompts: 3,
      visibilityScore: 100,
      competitorMentions: { OrbitDesk: 3 },
      topCompetitor: 'OrbitDesk',
      citationDomains: ['reviews.test'],
    });
    expect(finalBody.results).toHaveLength(3);
    expect(finalBody.completedAt).not.toBeNull();
  }, 20000);
});
