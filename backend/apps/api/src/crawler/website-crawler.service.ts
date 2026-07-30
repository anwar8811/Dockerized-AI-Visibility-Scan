import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { CrawledPage, CrawledPageType } from './crawled-page.interface';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_PAGES = 4;

// Order matters: this is also the priority a shared link gets claimed in
// when one anchor's URL/text happens to match more than one category
// (e.g. a "/pricing" page whose link text also mentions "features") -
// pricing wins, and product's search then looks for a still-unclaimed
// match instead (see findMatchingLink's seenUrls check).
const SECONDARY_PAGE_PATTERNS: Array<[Exclude<CrawledPageType, 'homepage'>, RegExp]> = [
  ['pricing', /pricing/i],
  ['about', /about/i],
  ['product', /product|features/i],
];

// Scoped crawl for EPIC-12's brand-detection/prompt-generation need only
// (KAD-15) - homepage + up to one each of pricing/about/product-or-features,
// same-domain, non-recursive (link discovery only ever looks at the
// homepage's own <a href> tags), plain HTTP + cheerio, no headless browser.
@Injectable()
export class WebsiteCrawlerService {
  private readonly logger = new Logger('CRAWLER');

  async crawl(websiteUrl: string): Promise<CrawledPage[]> {
    // Deliberately NOT wrapped in try/catch - a homepage fetch failure must
    // propagate and reject crawl() itself (this is what the caller turns
    // into the 422 "website cannot be accessed" case).
    const homepageHtml = await this.fetchPage(websiteUrl);
    const pages: CrawledPage[] = [{ url: websiteUrl, pageType: 'homepage', html: homepageHtml }];

    const originalHostname = new URL(websiteUrl).hostname;
    const $ = cheerio.load(homepageHtml);
    const seenUrls = new Set<string>([this.normalizeUrl(websiteUrl)]);

    for (const [pageType, pattern] of SECONDARY_PAGE_PATTERNS) {
      if (pages.length >= MAX_PAGES) {
        break;
      }

      const link = this.findMatchingLink($, websiteUrl, pattern, originalHostname, seenUrls);
      if (!link) {
        continue;
      }
      seenUrls.add(this.normalizeUrl(link));

      try {
        const html = await this.fetchPage(link);
        pages.push({ url: link, pageType, html });
      } catch {
        // A secondary page failing (timeout, 404, 500, ...) is not fatal -
        // the requirements only ask to crawl these pages "when available".
        // Only the homepage fetch failing is fatal.
        this.logger.log(`[CRAWLER] Skipping unavailable ${pageType} page: ${link}`);
      }
    }

    return pages;
  }

  private async fetchPage(url: string): Promise<string> {
    const response = await axios.get<string>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      headers: { 'User-Agent': 'AIVisibilityScanBot/1.0' },
    });
    return response.data;
  }

  // Returns the first same-domain, not-yet-claimed link on the homepage
  // whose resolved path or visible link text matches `pattern`
  // (case-insensitively) - or null if none is found.
  private findMatchingLink(
    $: cheerio.CheerioAPI,
    baseUrl: string,
    pattern: RegExp,
    originalHostname: string,
    seenUrls: Set<string>,
  ): string | null {
    let found: string | null = null;

    $('a[href]').each((_index, element) => {
      if (found) {
        return;
      }

      const href = $(element).attr('href');
      if (!href) {
        return;
      }

      let resolved: URL;
      try {
        resolved = new URL(href, baseUrl);
      } catch {
        return;
      }

      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return;
      }
      if (resolved.hostname !== originalHostname) {
        return;
      }

      const linkText = $(element).text();
      if (!pattern.test(resolved.pathname) && !pattern.test(linkText)) {
        return;
      }

      const resolvedString = resolved.toString();
      if (seenUrls.has(this.normalizeUrl(resolvedString))) {
        return;
      }

      found = resolvedString;
    });

    return found;
  }

  private normalizeUrl(url: string): string {
    return url.replace(/\/$/, '');
  }
}
