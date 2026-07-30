import { detectBrandName } from './brand-detector';
import { CrawledPage } from './crawled-page.interface';

function homepage(html: string, url = 'https://example.test'): CrawledPage {
  return { url, pageType: 'homepage', html };
}

describe('detectBrandName', () => {
  it('returns the og:site_name meta tag when present', () => {
    const page = homepage(`
      <html><head><meta property="og:site_name" content="Elegant"></head><body></body></html>
    `);
    expect(detectBrandName(page)).toBe('Elegant');
  });

  it('returns the JSON-LD Organization name when there is no og:site_name', () => {
    const page = homepage(`
      <html><head>
        <script type="application/ld+json">{"@type": "Organization", "name": "Elegant"}</script>
      </head><body></body></html>
    `);
    expect(detectBrandName(page)).toBe('Elegant');
  });

  it('returns the <title> text when there is no og:site_name or JSON-LD', () => {
    const page = homepage(`
      <html><head><title>Elegant - Product Studio</title></head><body></body></html>
    `);
    expect(detectBrandName(page)).toBe('Elegant - Product Studio');
  });

  it('returns the homepage <h1> text when nothing else matches', () => {
    const page = homepage(`
      <html><head></head><body><h1>Elegant</h1></body></html>
    `);
    expect(detectBrandName(page)).toBe('Elegant');
  });

  it('falls back to a domain-derived name when no signal is present at all', () => {
    const page = homepage('<html><head></head><body></body></html>', 'https://nimbuscrm.com');
    expect(detectBrandName(page)).toBe('Nimbuscrm');
  });

  it('strips a leading www. when deriving the domain fallback', () => {
    const page = homepage('<html><head></head><body></body></html>', 'https://www.example.com');
    expect(detectBrandName(page)).toBe('Example');
  });

  it('prefers og:site_name over every other signal when all are present', () => {
    const page = homepage(`
      <html><head>
        <meta property="og:site_name" content="Elegant-OG">
        <script type="application/ld+json">{"@type": "Organization", "name": "Elegant-JSONLD"}</script>
        <title>Elegant-Title</title>
      </head><body><h1>Elegant-H1</h1></body></html>
    `);
    expect(detectBrandName(page)).toBe('Elegant-OG');
  });

  it('finds the Organization name nested inside a top-level @graph array', () => {
    const page = homepage(`
      <html><head>
        <script type="application/ld+json">
          {"@context": "https://schema.org", "@graph": [
            {"@type": "WebSite", "name": "Not This One"},
            {"@type": "Organization", "name": "Elegant"}
          ]}
        </script>
      </head><body></body></html>
    `);
    expect(detectBrandName(page)).toBe('Elegant');
  });

  it('skips a malformed JSON-LD script and falls through to the next method, without throwing', () => {
    const page = homepage(`
      <html><head>
        <script type="application/ld+json">{not valid json at all</script>
      </head><body><h1>Fallback Brand</h1></body></html>
    `);
    expect(() => detectBrandName(page)).not.toThrow();
    expect(detectBrandName(page)).toBe('Fallback Brand');
  });
});
