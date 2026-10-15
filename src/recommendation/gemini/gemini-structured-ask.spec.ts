import { ConfigService } from '@nestjs/config';
import {
  GeminiClientService,
  StructuredAskUnavailableError,
} from './gemini-client.service';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

/** A provider call that only ends when its abort signal fires. */
function hangingCall(config: { config?: { abortSignal?: AbortSignal } }) {
  return new Promise((_resolve, reject) => {
    const signal = config.config?.abortSignal;
    if (signal?.aborted) reject(new Error('aborted'));
    signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

describe('GeminiClientService.askStructured', () => {
  let service: GeminiClientService;
  const ask = (extra: { timeoutMs?: number; signal?: AbortSignal } = {}) =>
    service.askStructured({
      call: 'test',
      prompt: 'p',
      schema: { type: 'object' },
      ...extra,
    });

  beforeEach(() => {
    generateContentMock.mockReset();
    const configuration: Pick<ConfigService, 'get'> = {
      get: jest.fn((key: string) =>
        key === 'GEMINI_API_KEY'
          ? 'key-of-test'
          : key === 'GEMINI_MODEL'
            ? 'a-model'
            : undefined,
      ) as ConfigService['get'],
    };
    service = new GeminiClientService(configuration as ConfigService);
  });

  it('returns the parsed JSON untouched', async () => {
    generateContentMock.mockResolvedValue({
      text: '{"results":[1]}',
      usageMetadata: { promptTokenCount: 10 },
    });
    await expect(ask()).resolves.toEqual({ results: [1] });
  });

  it.each([
    ['text that is not JSON', { text: 'not json' }],
    ['an empty answer', { text: '' }],
    ['no text at all', {}],
  ])(
    'reports %s as unavailable, never as a crash',
    async (_label, response) => {
      generateContentMock.mockResolvedValue(response);
      await expect(ask()).rejects.toBeInstanceOf(StructuredAskUnavailableError);
    },
  );

  it('reports a provider error as unavailable', async () => {
    generateContentMock.mockRejectedValue(new Error('500 upstream'));
    await expect(ask()).rejects.toBeInstanceOf(StructuredAskUnavailableError);
  });

  it('gives up after its own timeout and aborts the provider call', async () => {
    generateContentMock.mockImplementation(hangingCall);
    const startedAt = Date.now();
    await expect(ask({ timeoutMs: 30 })).rejects.toBeInstanceOf(
      StructuredAskUnavailableError,
    );
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('cancels the provider call when the caller leaves', async () => {
    generateContentMock.mockImplementation(hangingCall);
    const controller = new AbortController();
    const pending = ask({ signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toBeInstanceOf(StructuredAskUnavailableError);
  });

  it('does not even try when the caller was already gone', async () => {
    generateContentMock.mockImplementation(hangingCall);
    const controller = new AbortController();
    controller.abort();
    await expect(ask({ signal: controller.signal })).rejects.toBeInstanceOf(
      StructuredAskUnavailableError,
    );
  });
});
