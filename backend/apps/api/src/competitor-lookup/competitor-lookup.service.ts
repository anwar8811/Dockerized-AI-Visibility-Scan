import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { callOpenRouterChatCompletion } from '@app/common';
import { WebsiteCrawlerService } from '../crawler/website-crawler.service';

// Distinct from every other OpenRouter system instruction in this project
// (worker's product-recommendation one, the prompt-generator's brand-neutral
// one) - this one asks the AI to guess a company's own homepage URL from
// just its name, nothing else (KAD-20).
const UNKNOWN_MARKER = 'UNKNOWN';

const SYSTEM_INSTRUCTION = `You are a research assistant that finds a company's official website URL.

Given a company or brand name, respond with ONLY the single most likely official homepage URL for that company - no surrounding prose, no markdown code fences, no explanation, no quotes.

If you do not recognize this company, or are not reasonably confident of its actual official website, respond with exactly the single word ${UNKNOWN_MARKER} instead of guessing - never invent or fall back to an unrelated, generic, or well-known website you are not confident belongs to this specific company.

Example response: https://example.com`;

// Resolves a competitor's website from just its name (KAD-20) - no
// dedicated search API is introduced; an OpenRouter model guesses the
// likely URL, then that guess is validated by a real fetch (reusing
// WebsiteCrawlerService.crawl() directly, rather than adding a second
// "just check reachability" method to that service - the simplest option
// the story allows for). Never throws for an unresolvable competitor -
// resolution failure is a normal, expected `null` return, so STORY-041's
// caller can flag that one BrandProfile FAILED without its own try/catch.
@Injectable()
export class CompetitorLookupService {
  constructor(
    private readonly httpService: HttpService,
    private readonly crawlerService: WebsiteCrawlerService,
  ) {}

  async resolveCompetitorUrl(name: string): Promise<string | null> {
    let guessedUrl: string;
    try {
      const responseText = await callOpenRouterChatCompletion(this.httpService, {
        systemInstruction: SYSTEM_INSTRUCTION,
        userMessage: name,
      });
      guessedUrl = responseText.trim();
    } catch {
      return null;
    }

    if (guessedUrl.toUpperCase() === UNKNOWN_MARKER) {
      return null;
    }

    if (!this.isHttpUrl(guessedUrl)) {
      return null;
    }

    try {
      await this.crawlerService.crawl(guessedUrl);
    } catch {
      return null;
    }

    return guessedUrl;
  }

  private isHttpUrl(value: string): boolean {
    if (!value) {
      return false;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
