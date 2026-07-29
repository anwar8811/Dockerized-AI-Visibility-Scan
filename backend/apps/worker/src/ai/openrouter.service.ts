import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
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

interface OpenRouterChatCompletionResponse {
  choices: Array<{ message: { content: string } }>;
}

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger('AI');

  constructor(
    private readonly httpService: HttpService,
    private readonly productsService: ProductsService,
  ) {}

  async generate(prompt: string): Promise<string> {
    const baseUrl = process.env.OPENROUTER_BASE_URL;
    const model = process.env.OPENROUTER_MODEL;
    const apiKey = process.env.OPENROUTER_API_KEY;

    const productContext = JSON.stringify(this.productsService.getAll(), null, 2);
    const userMessage = `PRODUCT CONTEXT:\n\n${productContext}\n\n\nUSER QUESTION:\n\n${prompt}`;

    this.logger.log('[AI] Sending prompt to OpenRouter');

    // Never log `apiKey` itself anywhere - it is used only in this one
    // request header, and nowhere else in this class.
    const response = await firstValueFrom(
      this.httpService.post<OpenRouterChatCompletionResponse>(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: userMessage },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    this.logger.log('[AI] OpenRouter response received');

    return response.data.choices[0].message.content;
  }
}
