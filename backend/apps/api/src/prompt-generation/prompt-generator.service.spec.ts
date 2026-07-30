import { callOpenRouterChatCompletion } from '@app/common';
import { PromptGeneratorService } from './prompt-generator.service';
import { CrawledPage } from '../crawler/crawled-page.interface';

jest.mock('@app/common', () => ({
  callOpenRouterChatCompletion: jest.fn(),
}));

const mockedCallOpenRouterChatCompletion = callOpenRouterChatCompletion as jest.Mock;

describe('PromptGeneratorService', () => {
  let service: PromptGeneratorService;
  const pages: CrawledPage[] = [
    {
      url: 'https://example.test',
      pageType: 'homepage',
      html: '<html><body><h1>Example Co</h1><p>We sell widgets.</p></body></html>',
    },
  ];

  beforeEach(() => {
    mockedCallOpenRouterChatCompletion.mockReset();
    service = new PromptGeneratorService({} as any);
  });

  it('returns the exact 2 strings when the AI returns a valid 2-item JSON array', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      JSON.stringify(['What widget brands exist?', 'Is Example Co good for small teams?']),
    );

    const result = await service.generatePrompts(pages);

    expect(result).toEqual(['What widget brands exist?', 'Is Example Co good for small teams?']);
  });

  it.each([
    ['3 items', JSON.stringify(['a', 'b', 'c'])],
    ['1 item', JSON.stringify(['a'])],
    ['0 items', JSON.stringify([])],
  ])('throws when the AI returns valid JSON with %s', async (_label, responseText) => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(responseText);

    await expect(service.generatePrompts(pages)).rejects.toThrow();
  });

  it('throws when the AI returns non-JSON text wrapped in markdown code fences', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      '```json\n["a", "b"]\n```',
    );

    await expect(service.generatePrompts(pages)).rejects.toThrow();
  });

  it('throws when the AI returns conversational prose instead of JSON', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      'Sure! Here are two prompts for your business.',
    );

    await expect(service.generatePrompts(pages)).rejects.toThrow();
  });

  it('throws when the JSON array contains a non-string entry', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(JSON.stringify(['valid prompt', 42]));

    await expect(service.generatePrompts(pages)).rejects.toThrow();
  });

  it('throws when the JSON array contains an empty-string entry', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(JSON.stringify(['valid prompt', '   ']));

    await expect(service.generatePrompts(pages)).rejects.toThrow();
  });

  it('propagates the error unchanged when the underlying OpenRouter call fails', async () => {
    mockedCallOpenRouterChatCompletion.mockRejectedValue(new Error('network down'));

    await expect(service.generatePrompts(pages)).rejects.toThrow('network down');
  });
});
