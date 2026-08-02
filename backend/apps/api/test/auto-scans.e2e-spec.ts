import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpExceptionFilter, BrandProfile, BrandProfileRole } from '@app/common';
import { AppModule } from '../src/app.module';

// EPIC-13 (KAD-21) rewrite: POST /scans/auto no longer crawls/detects/
// generates inline (the old 4-case-branching + 422 behavior this suite
// used to test, STORY-035/036, no longer exists for this endpoint) - it
// only creates the Scan + one BrandProfile row per entity and enqueues a
// background job per entity. There is no BrandIntelligenceProcessor yet
// (that is STORY-041), so this suite only verifies the kickoff itself -
// real Postgres + Redis, no worker running.
describe('Auto Scans e2e - POST /scans/auto intelligence-gathering kickoff', () => {
  let apiApp: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    apiApp = moduleRef.createNestApplication();
    apiApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    apiApp.useGlobalFilters(new HttpExceptionFilter());
    await apiApp.init();
    dataSource = moduleRef.get(DataSource);
  }, 30000);

  afterAll(async () => {
    await apiApp?.close();
  });

  it('creates a Scan + one BrandProfile per entity, and returns GATHERING_INTELLIGENCE immediately', async () => {
    const response = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({
        website: 'https://fixture-brand.test',
        brandName: 'Fixture Brand',
        competitors: ['Acme', 'Globex'],
      })
      .expect(201);

    expect(response.body.status).toBe('GATHERING_INTELLIGENCE');
    const { scanId } = response.body;

    const profiles = await dataSource.getRepository(BrandProfile).find({ where: { scanId } });
    expect(profiles).toHaveLength(3);
    expect(profiles.find((p) => p.role === BrandProfileRole.BRAND)?.name).toBe('Fixture Brand');
    expect(
      profiles
        .filter((p) => p.role === BrandProfileRole.COMPETITOR)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Acme', 'Globex']);
  });

  it("leaves the BRAND profile's name null when brandName is omitted", async () => {
    const response = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({ website: 'https://fixture-brand.test', competitors: ['Acme'] })
      .expect(201);

    const { scanId } = response.body;
    const profiles = await dataSource.getRepository(BrandProfile).find({ where: { scanId } });
    expect(profiles.find((p) => p.role === BrandProfileRole.BRAND)?.name).toBeNull();
  });

  it('silently ignores an old-style prompts field via ValidationPipe whitelist - no Prompt row is ever created', async () => {
    const response = await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({
        website: 'https://fixture-brand.test',
        competitors: ['Acme'],
        prompts: ['p1', 'p2', 'p3'],
      })
      .expect(201);

    expect(response.body.status).toBe('GATHERING_INTELLIGENCE');
    const { scanId } = response.body;
    const promptRows = await dataSource.query(
      'SELECT count(*)::int AS count FROM prompt WHERE "scanId" = $1',
      [scanId],
    );
    expect(promptRows[0].count).toBe(0);
  });

  it('returns quickly - no crawl or AI call blocks the response', async () => {
    const start = Date.now();
    await request(apiApp.getHttpServer())
      .post('/scans/auto')
      .send({ website: 'https://fixture-brand.test', competitors: ['Acme'] })
      .expect(201);
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(2000);
  });
});
