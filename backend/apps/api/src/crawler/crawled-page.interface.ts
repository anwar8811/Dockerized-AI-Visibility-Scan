export type CrawledPageType = 'homepage' | 'pricing' | 'about' | 'product';

export interface CrawledPage {
  url: string;
  pageType: CrawledPageType;
  html: string;
}
