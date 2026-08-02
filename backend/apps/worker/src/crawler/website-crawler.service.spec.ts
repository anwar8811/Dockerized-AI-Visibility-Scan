import axios from 'axios';
import { WebsiteCrawlerService } from './website-crawler.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const BASE_URL = 'https://example.test';

describe('WebsiteCrawlerService', () => {
  let service: WebsiteCrawlerService;

  beforeEach(() => {
    service = new WebsiteCrawlerService();
    mockedAxios.get.mockReset();
  });

  function mockPages(pages: Record<string, string>) {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url in pages) {
        return Promise.resolve({ data: pages[url] });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it('crawls the homepage plus pricing/about/product pages found on it', async () => {
    mockPages({
      [BASE_URL]: `
        <html><body>
          <a href="/pricing">Pricing</a>
          <a href="/about">About Us</a>
          <a href="/features">Features</a>
        </body></html>
      `,
      [`${BASE_URL}/pricing`]: '<html><body>Pricing page</body></html>',
      [`${BASE_URL}/about`]: '<html><body>About page</body></html>',
      [`${BASE_URL}/features`]: '<html><body>Features page</body></html>',
    });

    const pages = await service.crawl(BASE_URL);

    expect(pages).toHaveLength(4);
    expect(pages.map((p) => p.pageType)).toEqual(['homepage', 'pricing', 'about', 'product']);
    expect(pages.find((p) => p.pageType === 'pricing')?.url).toBe(`${BASE_URL}/pricing`);
    expect(pages.find((p) => p.pageType === 'product')?.url).toBe(`${BASE_URL}/features`);
  });

  it('returns only the homepage when no matching links exist', async () => {
    mockPages({
      [BASE_URL]: '<html><body><a href="/blog">Blog</a></body></html>',
    });

    const pages = await service.crawl(BASE_URL);

    expect(pages).toHaveLength(1);
    expect(pages[0].pageType).toBe('homepage');
  });

  it('skips a matching link that points to a different domain', async () => {
    mockPages({
      [BASE_URL]: '<html><body><a href="https://other.test/pricing">Pricing</a></body></html>',
    });

    const pages = await service.crawl(BASE_URL);

    expect(pages).toHaveLength(1);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('rejects when the homepage itself cannot be fetched', async () => {
    mockedAxios.get.mockRejectedValue(new Error('ECONNABORTED: timeout'));

    await expect(service.crawl(BASE_URL)).rejects.toThrow();
  });

  it('does not fail the whole crawl when a secondary page is unavailable', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === BASE_URL) {
        return Promise.resolve({
          data: '<html><body><a href="/pricing">Pricing</a></body></html>',
        });
      }
      if (url === `${BASE_URL}/pricing`) {
        return Promise.reject(new Error('timeout'));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const pages = await service.crawl(BASE_URL);

    expect(pages).toHaveLength(1);
    expect(pages[0].pageType).toBe('homepage');
  });

  it('never fetches the same URL twice, even if it matches more than one category', async () => {
    mockPages({
      [BASE_URL]:
        '<html><body><a href="/plans-and-features">Pricing and Features</a></body></html>',
      [`${BASE_URL}/plans-and-features`]: '<html><body>Shared page</body></html>',
    });

    const pages = await service.crawl(BASE_URL);

    // homepage + the one shared link, claimed by "pricing" (first in
    // priority order) - "product"'s search then finds no other candidate.
    expect(pages).toHaveLength(2);
    expect(pages[1].pageType).toBe('pricing');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('caps at a maximum of 4 pages total', async () => {
    mockPages({
      [BASE_URL]: `
        <html><body>
          <a href="/pricing">Pricing</a>
          <a href="/about">About</a>
          <a href="/product">Product</a>
        </body></html>
      `,
      [`${BASE_URL}/pricing`]: '<html></html>',
      [`${BASE_URL}/about`]: '<html></html>',
      [`${BASE_URL}/product`]: '<html></html>',
    });

    const pages = await service.crawl(BASE_URL);

    expect(pages.length).toBeLessThanOrEqual(4);
  });
});
