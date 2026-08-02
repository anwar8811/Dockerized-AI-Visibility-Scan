import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as cheerio from 'cheerio';
import { callOpenRouterChatCompletion, CrawledPage } from '@app/common';

const MAX_PRODUCT_INFO_LENGTH = 6000;
const EXPECTED_PROMPT_COUNT = 2;

// Distinct from apps/worker's SYSTEM_INSTRUCTION (openrouter.service.ts) -
// that one answers a buyer's question from product context; this one asks
// the AI to invent the buyer's questions themselves, from a business's own
// website content (KAD-14 - only 2 of the 5 categories are picked, not all).
const SYSTEM_INSTRUCTION = `You are a market-research assistant that writes realistic buyer-intent search prompts.

Given a business's website content, generate EXACTLY 2 buyer-intent prompts - the kind of question a prospective customer might ask an AI assistant while researching whether to buy from this business.

Each of the 2 prompts must come from a DIFFERENT one of these 5 categories (choose whichever 2 categories fit this business best):
1. Category discovery - asking what options exist in this product/service category
2. Product recommendation - asking for a recommendation for a specific need
3. Product comparison - asking how this business compares to alternatives
4. Problem/solution - describing a problem and asking what solves it
5. Use-case - asking whether this business fits a specific use case

Respond with ONLY a JSON array of exactly 2 strings - no surrounding prose, no markdown code fences, no explanation. Example: ["prompt one text", "prompt two text"]`;

@Injectable()
export class PromptGeneratorService {
  constructor(private readonly httpService: HttpService) {}

  async generatePrompts(pages: CrawledPage[]): Promise<string[]> {
    const productInfo = this.buildProductInfoText(pages);

    const responseText = await callOpenRouterChatCompletion(this.httpService, {
      systemInstruction: SYSTEM_INSTRUCTION,
      userMessage: `BUSINESS WEBSITE CONTENT:\n\n${productInfo}`,
    });

    return this.parsePrompts(responseText);
  }

  private buildProductInfoText(pages: CrawledPage[]): string {
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

  // A parse/shape failure here is a generation failure, not a bug - it
  // throws so STORY-035's caller can turn it into a 422 response, rather
  // than ever returning an empty/partial/padded prompt list.
  private parsePrompts(responseText: string): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error('AI prompt generation returned invalid JSON');
    }

    const isValid =
      Array.isArray(parsed) &&
      parsed.length === EXPECTED_PROMPT_COUNT &&
      parsed.every((item) => typeof item === 'string' && item.trim().length > 0);

    if (!isValid) {
      throw new Error(
        `AI prompt generation did not return exactly ${EXPECTED_PROMPT_COUNT} non-empty strings`,
      );
    }

    return parsed as string[];
  }
}
