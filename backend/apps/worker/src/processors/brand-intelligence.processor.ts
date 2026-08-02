import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import * as cheerio from 'cheerio';
import {
  BrandProfile,
  BrandProfileRole,
  BrandProfileStatus,
  ScanPromptStatus,
  BRAND_INTELLIGENCE_QUEUE,
  CrawledPage,
  callOpenRouterChatCompletion,
} from '@app/common';
import { WebsiteCrawlerService } from '../crawler/website-crawler.service';
import { detectBrandName } from '../crawler/brand-detector';
import { CompetitorLookupService } from '../competitor-lookup/competitor-lookup.service';

interface BrandIntelligenceJobData {
  scanId: string;
  brandProfileId: string;
}

interface GatheredIntelligence {
  servicesOffered: string;
  metaDescription: string;
  summary: string;
  pros: string[];
  cons: string[];
}

const MAX_PRODUCT_INFO_LENGTH = 6000;

// Distinct from both apps/worker's classic SYSTEM_INSTRUCTION (product
// recommendation) and apps/api's prompt-generator instruction (buyer-intent
// prompts) - this one asks for a structured business-intelligence summary
// from a crawled website (EPIC-13, KAD-22).
const SYSTEM_INSTRUCTION = `You are a business research assistant that summarizes a company's website into structured intelligence.

Given a company's website content, respond with ONLY a JSON object with exactly these fields - no surrounding prose, no markdown code fences:
{
  "servicesOffered": "a concise paragraph describing what products/services this company offers",
  "metaDescription": "a short, one-sentence description of the company, similar to a meta description",
  "summary": "a brief overall summary of the company and what it does",
  "pros": ["2 to 4 short strengths/advantages of this company, based only on the given content"],
  "cons": ["1 to 3 short potential weaknesses/limitations, based only on the given content"]
}`;

// Consumes STORY-040's brand-intelligence queue - one job per BrandProfile
// row (KAD-23). Every content-level failure (unresolvable competitor,
// unreachable website, unusable AI output) is caught and turned into
// status = FAILED; the job itself still completes successfully (never a
// BullMQ retry) for those cases - only a genuine infrastructure error
// (DB/Redis down) is left to propagate and retry, matching FR10.3's
// existing retryable-vs-terminal distinction.
@Injectable()
@Processor(BRAND_INTELLIGENCE_QUEUE)
export class BrandIntelligenceProcessor extends WorkerHost {
  private readonly logger = new Logger('BRAND_INTELLIGENCE');

  constructor(
    @InjectRepository(BrandProfile)
    private readonly brandProfileRepository: Repository<BrandProfile>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly crawlerService: WebsiteCrawlerService,
    private readonly competitorLookupService: CompetitorLookupService,
  ) {
    super();
  }

  async process(job: Job<BrandIntelligenceJobData>): Promise<void> {
    const { scanId, brandProfileId } = job.data;

    this.logger.log(`[BRAND_INTELLIGENCE] Processing ${brandProfileId}`);

    const profile = await this.brandProfileRepository.findOneByOrFail({ id: brandProfileId });

    let sourceUrl = profile.sourceUrl;
    if (profile.role === BrandProfileRole.COMPETITOR && !sourceUrl) {
      sourceUrl = await this.competitorLookupService.resolveCompetitorUrl(profile.name!);
      if (!sourceUrl) {
        await this.markFailed(scanId, brandProfileId, 'competitor URL could not be resolved');
        return;
      }
    }

    let pages: CrawledPage[];
    try {
      pages = await this.crawlerService.crawl(sourceUrl!);
    } catch (error) {
      await this.markFailed(
        scanId,
        brandProfileId,
        `crawl failed: ${(error as Error).message}`,
      );
      return;
    }

    // The BRAND row's name is still null only when the caller omitted
    // brandName on POST /scans/auto (STORY-040) - resolve it here from the
    // just-crawled homepage, same priority chain as EPIC-12, unmodified.
    let name = profile.name;
    if (!name) {
      const homepage = pages.find((page) => page.pageType === 'homepage')!;
      name = detectBrandName(homepage);
    }

    let gathered: GatheredIntelligence;
    try {
      gathered = await this.summarize(pages);
    } catch (error) {
      await this.markFailed(
        scanId,
        brandProfileId,
        `AI summarization failed: ${(error as Error).message}`,
      );
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(BrandProfile, brandProfileId, {
        name,
        sourceUrl,
        servicesOffered: gathered.servicesOffered,
        metaDescription: gathered.metaDescription,
        summary: gathered.summary,
        pros: gathered.pros,
        cons: gathered.cons,
        status: BrandProfileStatus.COMPLETED,
      });
      await this.checkIntelligenceGatheringComplete(manager, scanId);
    });

    this.logger.log(`[BRAND_INTELLIGENCE] Completed ${brandProfileId}`);
  }

  private async markFailed(
    scanId: string,
    brandProfileId: string,
    reason: string,
  ): Promise<void> {
    this.logger.log(`[BRAND_INTELLIGENCE] ${brandProfileId} FAILED - ${reason}`);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(BrandProfile, brandProfileId, { status: BrandProfileStatus.FAILED });
      await this.checkIntelligenceGatheringComplete(manager, scanId);
    });
  }

  // Race-safe, exactly-once transition: flips GATHERING_INTELLIGENCE ->
  // INTELLIGENCE_READY only once no BrandProfile row for this scan is
  // still PENDING. There is no natural "increment a counter" column here
  // (unlike STORY-018's processedPrompts), so this uses a NOT EXISTS
  // check instead of an UPDATE ... RETURNING count - but the same
  // underlying guarantee holds: this UPDATE takes a row lock on `scan`,
  // so two near-simultaneous completions for the same scan serialize,
  // and only the one that runs (or re-runs, after the other commits and
  // releases the lock) with every row already non-PENDING ever performs
  // the transition (concepts/26-atomic-update-returning-and-manager-query-gotcha.md).
  private async checkIntelligenceGatheringComplete(
    manager: EntityManager,
    scanId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE scan SET status = $2
       WHERE id = $1 AND status = $3
       AND NOT EXISTS (SELECT 1 FROM brand_profile WHERE "scanId" = $1 AND status = $4)`,
      [
        scanId,
        ScanPromptStatus.INTELLIGENCE_READY,
        ScanPromptStatus.GATHERING_INTELLIGENCE,
        BrandProfileStatus.PENDING,
      ],
    );
  }

  private async summarize(pages: CrawledPage[]): Promise<GatheredIntelligence> {
    const websiteContent = this.buildPageText(pages);

    const responseText = await callOpenRouterChatCompletion(this.httpService, {
      systemInstruction: SYSTEM_INSTRUCTION,
      userMessage: `WEBSITE CONTENT:\n\n${websiteContent}`,
    });

    return this.parseGatheredIntelligence(responseText);
  }

  // Small, well-understood cheerio text-extraction helper, duplicated
  // rather than shared via libs/common: apps/api's PromptGeneratorService
  // has its own near-identical version today, but STORY-043 is expected to
  // remove PromptGeneratorService's need for CrawledPage[]/cheerio
  // entirely (it will read already-gathered BrandProfile fields instead),
  // so extracting a shared utility now would only serve this one caller
  // going forward.
  private buildPageText(pages: CrawledPage[]): string {
    const combinedText = pages
      .map((page) => {
        const $ = cheerio.load(page.html);
        $('script, style').remove();
        return $('body').text();
      })
      .join('\n\n')
      .replace(/\s+/g, ' ')
      .trim();

    return combinedText.slice(0, MAX_PRODUCT_INFO_LENGTH);
  }

  private parseGatheredIntelligence(responseText: string): GatheredIntelligence {
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error('AI summarization returned invalid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI summarization returned a non-object JSON value');
    }
    const obj = parsed as Record<string, unknown>;

    const isNonEmptyString = (value: unknown): value is string =>
      typeof value === 'string' && value.trim().length > 0;
    const isStringArray = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every(isNonEmptyString);

    if (
      !isNonEmptyString(obj.servicesOffered) ||
      !isNonEmptyString(obj.metaDescription) ||
      !isNonEmptyString(obj.summary) ||
      !isStringArray(obj.pros) ||
      !isStringArray(obj.cons)
    ) {
      throw new Error('AI summarization returned an unusable shape');
    }

    return {
      servicesOffered: obj.servicesOffered.trim(),
      metaDescription: obj.metaDescription.trim(),
      summary: obj.summary.trim(),
      pros: obj.pros,
      cons: obj.cons,
    };
  }

  // Same §7-required @OnWorkerEvent('failed') hook as prompt-scan.processor.ts -
  // only observes; only a genuine infrastructure error ever reaches here,
  // since every content-level failure above is already caught and turned
  // into a successful job completion with status = FAILED.
  @OnWorkerEvent('failed')
  onJobFailed(job: Job<BrandIntelligenceJobData> | undefined): void {
    if (!job) {
      return;
    }
    const willRetry = job.attemptsMade < (job.opts.attempts ?? 1);
    this.logger.error(
      willRetry
        ? `[BRAND_INTELLIGENCE] Job ${job.data.brandProfileId} failed — retry scheduled`
        : `[BRAND_INTELLIGENCE] Job ${job.data.brandProfileId} failed — no more retries`,
    );
  }
}
