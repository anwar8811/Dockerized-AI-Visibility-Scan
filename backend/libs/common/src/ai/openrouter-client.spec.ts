import { of, throwError } from 'rxjs';
import { callOpenRouterChatCompletion } from './openrouter-client';

describe('callOpenRouterChatCompletion', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1',
      OPENROUTER_MODEL: 'test/model:free',
      OPENROUTER_API_KEY: 'secret-test-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends the exact request shape and returns the response text', async () => {
    const post = jest.fn().mockReturnValue(
      of({ data: { choices: [{ message: { content: 'Try NimbusCRM.' } }] } }),
    );
    const httpService = { post } as any;

    const result = await callOpenRouterChatCompletion(httpService, {
      systemInstruction: 'You are a helpful assistant.',
      userMessage: 'What CRM should I use?',
    });

    expect(result).toBe('Try NimbusCRM.');
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe('https://openrouter.test/api/v1/chat/completions');
    expect(body.model).toBe('test/model:free');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What CRM should I use?' },
    ]);
    expect(options.headers.Authorization).toBe('Bearer secret-test-key');
  });

  it('uses the given model override instead of OPENROUTER_MODEL when one is supplied', async () => {
    const post = jest.fn().mockReturnValue(
      of({ data: { choices: [{ message: { content: 'ok' } }] } }),
    );
    const httpService = { post } as any;

    await callOpenRouterChatCompletion(httpService, {
      systemInstruction: 'irrelevant',
      userMessage: 'irrelevant',
      model: 'some/other-model:free',
    });

    const [, body] = post.mock.calls[0];
    expect(body.model).toBe('some/other-model:free');
  });

  it('propagates the error unchanged when the HTTP call fails', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => new Error('network down')));
    const httpService = { post } as any;

    await expect(
      callOpenRouterChatCompletion(httpService, {
        systemInstruction: 'irrelevant',
        userMessage: 'irrelevant',
      }),
    ).rejects.toThrow('network down');
  });
});
