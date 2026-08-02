import { callOpenRouterChatCompletion } from '@app/common';
import { PromptGeneratorService, BrandIntelligenceInput } from './prompt-generator.service';

jest.mock('@app/common', () => ({
  callOpenRouterChatCompletion: jest.fn(),
}));

const mockedCallOpenRouterChatCompletion = callOpenRouterChatCompletion as jest.Mock;

describe('PromptGeneratorService', () => {
  let service: PromptGeneratorService;
  const brand: BrandIntelligenceInput = {
    name: 'Example Co',
    servicesOffered: 'Widgets and gadgets for small teams.',
    metaDescription: 'A widget company.',
    summary: 'Example Co sells widgets.',
  };

  beforeEach(() => {
    mockedCallOpenRouterChatCompletion.mockReset();
    service = new PromptGeneratorService({} as any);
  });

  it('returns the exact 3 strings when the AI returns a valid 3-item JSON array', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      JSON.stringify([
        'What widget brands exist for small teams?',
        'Which widget provider is best for automating small workflows?',
        'How do widget providers compare on price and reliability?',
      ]),
    );

    const result = await service.generatePrompts(brand);

    expect(result).toEqual([
      'What widget brands exist for small teams?',
      'Which widget provider is best for automating small workflows?',
      'How do widget providers compare on price and reliability?',
    ]);
  });

  it.each([
    ['2 items', JSON.stringify(['a', 'b'])],
    ['4 items', JSON.stringify(['a', 'b', 'c', 'd'])],
    ['0 items', JSON.stringify([])],
  ])('throws when the AI returns valid JSON with %s', async (_label, responseText) => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(responseText);

    await expect(service.generatePrompts(brand)).rejects.toThrow();
  });

  it('throws when the AI returns non-JSON text wrapped in markdown code fences', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue('```json\n["a", "b", "c"]\n```');

    await expect(service.generatePrompts(brand)).rejects.toThrow();
  });

  it('throws when the AI returns conversational prose instead of JSON', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      'Sure! Here are three prompts for your business.',
    );

    await expect(service.generatePrompts(brand)).rejects.toThrow();
  });

  it('throws when the JSON array contains a non-string entry', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      JSON.stringify(['valid prompt', 42, 'another valid prompt']),
    );

    await expect(service.generatePrompts(brand)).rejects.toThrow();
  });

  it('throws when the JSON array contains an empty-string entry', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      JSON.stringify(['valid prompt', '   ', 'another valid prompt']),
    );

    await expect(service.generatePrompts(brand)).rejects.toThrow();
  });

  it('throws (defense-in-depth) when a generated prompt names the brand directly', async () => {
    mockedCallOpenRouterChatCompletion.mockResolvedValue(
      JSON.stringify([
        'Is Example Co good for small teams?',
        'What widget brands exist?',
        'How do widget providers compare?',
      ]),
    );

    await expect(service.generatePrompts(brand)).rejects.toThrow(
      'AI prompt generation mentioned the brand name directly',
    );
  });

  it('propagates the error unchanged when the underlying OpenRouter call fails', async () => {
    mockedCallOpenRouterChatCompletion.mockRejectedValue(new Error('network down'));

    await expect(service.generatePrompts(brand)).rejects.toThrow('network down');
  });
});
