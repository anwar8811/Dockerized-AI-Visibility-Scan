import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface OpenRouterChatCompletionParams {
  systemInstruction: string;
  userMessage: string;
  // Optional per-call model override (EPIC-13, KAD-24/KAD-25) - defaults to
  // process.env.OPENROUTER_MODEL when omitted, so every existing caller's
  // behavior is completely unchanged. Lets distinct steps (prompt
  // generation vs. prompt-answering, STORY-043/STORY-046) each pin their
  // own free-tier model without a second, near-duplicate HTTP client.
  model?: string;
}

interface OpenRouterChatCompletionResponse {
  choices: Array<{ message: { content: string } }>;
}

// Low-level "call OpenRouter's chat/completions endpoint" HTTP mechanics,
// shared by apps/worker's OpenRouterService (AI-response generation) and
// apps/api's PromptGeneratorService (STORY-034, AI prompt generation) - each
// caller keeps its own system instruction/message shape; only this one HTTP
// call is written once (KAD-19).
//
// httpService is passed in by the caller (not looked up/constructed here)
// so each caller's own NestJS-injected HttpService instance is what
// actually performs the request - this is also what keeps apps/worker's
// existing OpenRouterService unit tests passing unmodified after STORY-033's
// refactor, since they construct OpenRouterService with a plain mocked
// httpService object and assert directly on its post() call.
export async function callOpenRouterChatCompletion(
  httpService: HttpService,
  { systemInstruction, userMessage, model }: OpenRouterChatCompletionParams,
): Promise<string> {
  const baseUrl = process.env.OPENROUTER_BASE_URL;
  const resolvedModel = model ?? process.env.OPENROUTER_MODEL;
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Never log `apiKey` itself anywhere - it is used only in this one
  // request header, and nowhere else in this function.
  const response = await firstValueFrom(
    httpService.post<OpenRouterChatCompletionResponse>(
      `${baseUrl}/chat/completions`,
      {
        model: resolvedModel,
        messages: [
          { role: 'system', content: systemInstruction },
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

  return response.data.choices[0].message.content;
}
