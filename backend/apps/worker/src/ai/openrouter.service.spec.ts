import { Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { OpenRouterService } from './openrouter.service';
import { ProductsService } from '../products/products.service';

describe('OpenRouterService', () => {
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

  function buildService(fakeProducts: unknown[], responseText: string) {
    const productsService = {
      getAll: jest.fn().mockReturnValue(fakeProducts),
    } as unknown as ProductsService;

    const post = jest
      .fn()
      .mockReturnValue(of({ data: { choices: [{ message: { content: responseText } }] } }));
    const httpService = { post } as any;

    return { service: new OpenRouterService(httpService, productsService), post };
  }

  it('builds the exact system/context/question request shape and returns the AI text', async () => {
    const { service, post } = buildService(
      [{ name: 'NimbusCRM', description: '', targetCustomer: '', features: [], pricingDescription: '', sourceUrls: [] }],
      'Try NimbusCRM.',
    );

    const result = await service.generate('What CRM should I use?');

    expect(result).toBe('Try NimbusCRM.');
    expect(post).toHaveBeenCalledTimes(1);

    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe('https://openrouter.test/api/v1/chat/completions');
    expect(body.model).toBe('test/model:free');
    expect(body.messages).toHaveLength(2);

    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain(
      "Answer the user's question using ONLY the supplied product context.",
    );
    expect(body.messages[0].content).toContain('Do not invent products, features, pricing information,');

    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('PRODUCT CONTEXT:');
    expect(body.messages[1].content).toContain('NimbusCRM');
    expect(body.messages[1].content).toContain('USER QUESTION:');
    expect(body.messages[1].content).toContain('What CRM should I use?');

    expect(options.headers.Authorization).toBe('Bearer secret-test-key');
  });

  it('never logs the API key', async () => {
    const { service } = buildService([], 'ok');
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    await service.generate('test prompt');

    const loggedMessages = logSpy.mock.calls.map((call) => String(call[0]));
    for (const message of loggedMessages) {
      expect(message).not.toContain('secret-test-key');
    }
    logSpy.mockRestore();
  });
});
