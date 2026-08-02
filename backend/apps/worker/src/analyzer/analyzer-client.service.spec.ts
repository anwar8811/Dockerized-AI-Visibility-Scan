import { of } from 'rxjs';
import { AnalyzerClientService } from './analyzer-client.service';

describe('AnalyzerClientService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANALYZER_URL: 'http://analyzer.test:8080' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('posts the brand/competitors/response to ANALYZER_URL/analyze and returns the analysis', async () => {
    const analyzerResponse = {
      brandMentioned: true,
      brandMentionCount: 2,
      competitorsMentioned: ['OrbitDesk'],
      citationDomains: ['reviews.test'],
    };
    const post = jest.fn().mockReturnValue(of({ data: analyzerResponse }));
    const httpService = { post } as any;

    const service = new AnalyzerClientService(httpService);
    const result = await service.analyze({
      brand: 'NimbusCRM',
      competitors: ['OrbitDesk', 'ClientLoop'],
      response: 'NimbusCRM is great. See https://reviews.test/compare.',
    });

    expect(result).toEqual(analyzerResponse);
    expect(post).toHaveBeenCalledTimes(1);

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('http://analyzer.test:8080/analyze');
    expect(body).toEqual({
      brand: 'NimbusCRM',
      competitors: ['OrbitDesk', 'ClientLoop'],
      response: 'NimbusCRM is great. See https://reviews.test/compare.',
    });
  });

  it('posts the response/entities to ANALYZER_URL/analyze/rank and returns the rankings', async () => {
    const rankResponse = {
      rankings: [
        { entityId: 'brand-1', mentionCount: 2, rank: 1 },
        { entityId: 'comp-1', mentionCount: 1, rank: 2 },
      ],
      citationDomains: ['reviews.test'],
    };
    const post = jest.fn().mockReturnValue(of({ data: rankResponse }));
    const httpService = { post } as any;

    const service = new AnalyzerClientService(httpService);
    const result = await service.analyzeRank({
      response: 'NimbusCRM is great. See https://reviews.test/compare.',
      entities: [
        { id: 'brand-1', name: 'NimbusCRM' },
        { id: 'comp-1', name: 'OrbitDesk' },
      ],
    });

    expect(result).toEqual(rankResponse);
    expect(post).toHaveBeenCalledTimes(1);

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('http://analyzer.test:8080/analyze/rank');
    expect(body).toEqual({
      response: 'NimbusCRM is great. See https://reviews.test/compare.',
      entities: [
        { id: 'brand-1', name: 'NimbusCRM' },
        { id: 'comp-1', name: 'OrbitDesk' },
      ],
    });
  });
});
