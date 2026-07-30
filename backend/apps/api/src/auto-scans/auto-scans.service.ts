import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CrawledPage } from '../crawler/crawled-page.interface';
import { WebsiteCrawlerService } from '../crawler/website-crawler.service';
import { detectBrandName } from '../crawler/brand-detector';
import { PromptGeneratorService } from '../prompt-generation/prompt-generator.service';
import { ScansService } from '../scans/scans.service';
import { CreateAutoScanDto } from './dto/create-auto-scan.dto';

@Injectable()
export class AutoScansService {
  constructor(
    private readonly crawlerService: WebsiteCrawlerService,
    private readonly promptGeneratorService: PromptGeneratorService,
    private readonly scansService: ScansService,
  ) {}

  // FR13's 4-case branching: the website is crawled at most once, only
  // when something is actually missing, and the same crawl result feeds
  // both brand detection and prompt generation when both are missing
  // (never two separate crawls).
  async create(dto: CreateAutoScanDto): Promise<{ scanId: string; status: string }> {
    const needsCrawl = !dto.brandName || !dto.prompts;

    let pages: CrawledPage[] | undefined;
    if (needsCrawl) {
      try {
        pages = await this.crawlerService.crawl(dto.website);
      } catch {
        throw new UnprocessableEntityException(
          'Unable to extract sufficient brand information from the website.',
        );
      }
    }

    const brandName = dto.brandName ?? this.detectBrandNameFrom(pages!);

    let prompts = dto.prompts;
    if (!prompts) {
      try {
        prompts = await this.promptGeneratorService.generatePrompts(pages!);
      } catch {
        throw new UnprocessableEntityException(
          'Unable to generate prompts from the website content.',
        );
      }
    }

    // Both UnprocessableEntityException throws above happen before this
    // line - no partial Scan/Prompt write is ever possible (KAD-18).
    return this.scansService.createFromResolvedInputs(
      brandName,
      dto.website,
      dto.competitors,
      prompts,
    );
  }

  private detectBrandNameFrom(pages: CrawledPage[]): string {
    const homepage = pages.find((page) => page.pageType === 'homepage')!;
    return detectBrandName(homepage);
  }
}
