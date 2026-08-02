import { callOpenRouterChatCompletion } from '@app/common';
import { CompetitorLookupService } from './competitor-lookup.service';

jest.mock('@app/common', () => ({
  callOpenRouterChatCompletion: jest.fn(),
}));

const mockedCallOpenRouterChatCompletion = callOpenRouterChatCompletion as jest.Mock;

describe('CompetitorLookupService', () => {
  function buildService() {
    const crawlerService = { crawl: jest.fn() };
    const service = new CompetitorLookupService({} as any, crawlerService as any);
    return { service, crawlerService };
  }

  beforeEach(() => {
    mockedCallOpenRouterChatCompletion.mockReset();
  });

  it('returns the guessed URL when it is syntactically valid and the fetch succeeds', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('https://competitor.test');
    crawlerService.crawl.mockResolvedValue([
      { url: 'https://competitor.test', pageType: 'homepage', html: '<html></html>' },
    ]);

    const result = await service.resolveCompetitorUrl('Competitor Inc');

    expect(result).toBe('https://competitor.test');
    expect(crawlerService.crawl).toHaveBeenCalledWith('https://competitor.test');
  });

  it('trims surrounding whitespace from the AI response before validating', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('  https://competitor.test  \n');
    crawlerService.crawl.mockResolvedValue([]);

    const result = await service.resolveCompetitorUrl('Competitor Inc');

    expect(result).toBe('https://competitor.test');
  });

  it('returns null when the AI explicitly signals it does not recognize the company', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('UNKNOWN');

    const result = await service.resolveCompetitorUrl('Xyzzyplorp Nonexistent Company');

    expect(result).toBeNull();
    expect(crawlerService.crawl).not.toHaveBeenCalled();
  });

  it('returns null when the AI returns conversational prose instead of a URL', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('I am not sure which company you mean.');

    const result = await service.resolveCompetitorUrl('Unknown Co');

    expect(result).toBeNull();
    expect(crawlerService.crawl).not.toHaveBeenCalled();
  });

  it('returns null when the AI returns an empty string', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('');

    const result = await service.resolveCompetitorUrl('Unknown Co');

    expect(result).toBeNull();
    expect(crawlerService.crawl).not.toHaveBeenCalled();
  });

  it('returns null when the AI returns a non-http(s) URL scheme', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('ftp://competitor.test');

    const result = await service.resolveCompetitorUrl('Some Co');

    expect(result).toBeNull();
    expect(crawlerService.crawl).not.toHaveBeenCalled();
  });

  it('returns null when the guessed URL is syntactically valid but the fetch fails', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockResolvedValue('https://does-not-exist.test');
    crawlerService.crawl.mockRejectedValue(new Error('ENOTFOUND'));

    const result = await service.resolveCompetitorUrl('Ghost Co');

    expect(result).toBeNull();
  });

  it('returns null when the underlying OpenRouter call itself fails', async () => {
    const { service, crawlerService } = buildService();
    mockedCallOpenRouterChatCompletion.mockRejectedValue(new Error('network down'));

    const result = await service.resolveCompetitorUrl('Some Co');

    expect(result).toBeNull();
    expect(crawlerService.crawl).not.toHaveBeenCalled();
  });
});
