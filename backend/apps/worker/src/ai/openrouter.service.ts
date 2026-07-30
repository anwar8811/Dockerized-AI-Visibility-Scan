import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { callOpenRouterChatCompletion } from '@app/common';
import { ProductsService } from '../products/products.service';

// Reproduced verbatim from the brief's §18 AI Prompt Format - the rules
// themselves never mentioned "Qwen" by name, so nothing here needed
// adapting for the OpenRouter swap (KAD-02).
const SYSTEM_INSTRUCTION = `You are a SaaS product recommendation assistant.

Answer the user's question using ONLY the supplied product context.

Recommend products only when they are relevant to the question.

Write a concise and useful response.

When information comes from the supplied source URLs,
include relevant URLs in a Sources section.

Do not invent products, features, pricing information,
companies or URLs outside the supplied context.`;

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger('AI');

  constructor(
    private readonly httpService: HttpService,
    private readonly productsService: ProductsService,
  ) {}

  async generate(prompt: string): Promise<string> {
    const productContext = JSON.stringify(this.productsService.getAll(), null, 2);
    const userMessage = `PRODUCT CONTEXT:\n\n${productContext}\n\n\nUSER QUESTION:\n\n${prompt}`;

    this.logger.log('[AI] Sending prompt to OpenRouter');

    // The shared client (libs/common, STORY-033) owns the actual HTTP
    // mechanics and header/URL construction - see KAD-19.
    const content = await callOpenRouterChatCompletion(this.httpService, {
      systemInstruction: SYSTEM_INSTRUCTION,
      userMessage,
    });

    this.logger.log('[AI] OpenRouter response received');

    return content;
  }
}
