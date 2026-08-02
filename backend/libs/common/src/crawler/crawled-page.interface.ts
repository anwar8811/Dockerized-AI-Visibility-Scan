// Shared with apps/worker (WebsiteCrawlerService/brand-detector, EPIC-13
// relocation) and apps/api (PromptGeneratorService's type reference) -
// moved here from apps/api/src/crawler/ during STORY-041, since
// apps/api and apps/worker never import from each other's src/
// directories (only libs/common is shared).
export type CrawledPageType = 'homepage' | 'pricing' | 'about' | 'product';

export interface CrawledPage {
  url: string;
  pageType: CrawledPageType;
  html: string;
}
