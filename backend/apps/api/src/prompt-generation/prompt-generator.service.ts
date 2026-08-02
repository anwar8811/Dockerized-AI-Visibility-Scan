import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { callOpenRouterChatCompletion } from '@app/common';

const EXPECTED_PROMPT_COUNT = 3;

export interface BrandIntelligenceInput {
  name: string;
  servicesOffered: string;
  metaDescription: string;
  summary: string;
}

// EPIC-13 (STORY-043) rewrite: exactly 3 brand-NEUTRAL prompts (never
// naming the brand, KAD-24), read from the brand's already-gathered
// BrandProfile fields (STORY-041) - no longer takes CrawledPage[]/cheerio
// at all, since the summarization already happened upstream.
const SYSTEM_INSTRUCTION = `You are a market-research assistant that writes realistic, brand-neutral buyer-intent search prompts.

Given a business's services/summary, generate EXACTLY 3 buyer-intent prompts - the kind of question a prospective customer might ask an AI assistant while researching options in this business's category.

Each of the 3 prompts must come from a DIFFERENT one of these 5 categories (choose whichever 3 categories fit this business best):
1. Category discovery - asking what options exist in this product/service category
2. Product recommendation - asking for a recommendation for a specific need
3. Product comparison - asking how businesses in this category compare to each other
4. Problem/solution - describing a problem and asking what solves it
5. Use-case - asking whether this kind of business fits a specific use case

CRITICAL: never mention this business's own name in any prompt - describe only the service/need/category, so the exact same 3 prompts can later be used to evaluate any of its competitors too.

Respond with ONLY a JSON array of exactly 3 strings - no surrounding prose, no markdown code fences, no explanation. Example: ["prompt one text", "prompt two text", "prompt three text"]`;

@Injectable()
export class PromptGeneratorService {
  constructor(private readonly httpService: HttpService) {}

  async generatePrompts(brand: BrandIntelligenceInput): Promise<string[]> {
    const userMessage = [
      `SERVICES OFFERED:\n\n${brand.servicesOffered}`,
      `SUMMARY:\n\n${brand.summary}`,
      `META DESCRIPTION:\n\n${brand.metaDescription}`,
    ].join('\n\n');

    const responseText = await callOpenRouterChatCompletion(this.httpService, {
      systemInstruction: SYSTEM_INSTRUCTION,
      userMessage,
    });

    return this.parsePrompts(responseText, brand.name);
  }

  // A parse/shape failure here is a generation failure, not a bug - it
  // throws so STORY-043's caller can turn it into a 422 response, rather
  // than ever returning an empty/partial/padded prompt list.
  private parsePrompts(responseText: string, brandName: string): string[] {
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

    const prompts = parsed as string[];

    // Defense-in-depth (enforced in code, not left to prompt-instruction-only
    // compliance): the whole point of a brand-neutral prompt is that the
    // exact same 3 prompts get reused to evaluate every competitor too - a
    // prompt that names the brand defeats that, even if the system
    // instruction explicitly forbade it.
    const lowerBrandName = brandName.trim().toLowerCase();
    if (lowerBrandName && prompts.some((prompt) => prompt.toLowerCase().includes(lowerBrandName))) {
      throw new Error('AI prompt generation mentioned the brand name directly');
    }

    return prompts;
  }
}
