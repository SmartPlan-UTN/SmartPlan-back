import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  GeminiClientService,
  StructuredAskUnavailableError,
} from '../../recommendation/gemini/gemini-client.service';
import {
  ASSISTANT_MAX_CONCURRENT,
  AssistantLimiter,
} from './assistant-limiter';
import { ComposerAssistantService } from './composer-assistant.service';

const row = (id: number, estimatedDuration = 60) => ({
  id,
  name: `Activity ${id}`,
  description: 'Description',
  estimatedCost: '1000',
  estimatedDuration,
  type: null,
  categories: [{ id: 1, name: 'Culture' }],
  latitude: null,
  longitude: null,
});

describe('ComposerAssistantService (operations)', () => {
  let askStructured: jest.Mock;
  let service: ComposerAssistantService;

  beforeEach(() => {
    askStructured = jest.fn();
    const dataSource = {
      query: jest.fn().mockResolvedValue([row(1), row(2), row(3)]),
    } as unknown as DataSource;
    service = new ComposerAssistantService(
      dataSource,
      { askStructured } as unknown as GeminiClientService,
      new AssistantLimiter(),
    );
  });

  const search = (signal?: AbortSignal, userId = 1) =>
    service.search(
      { query: 'algo tranquilo para la tarde', stopActivityIds: [] },
      { userId, signal },
    );

  it('turns provider failures into 503 ASSISTANT_UNAVAILABLE', async () => {
    askStructured.mockRejectedValue(new StructuredAskUnavailableError());
    await expect(search()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    ['a string', 'nonsense'],
    ['null', null],
    ['an array', []],
    ['the wrong shapes', { results: 'x', maxPrice: 'cheap', tags: 5 }],
    ['unknown ids only', { results: [{ id: 99, reason: 'x' }], tags: [] }],
  ])(
    'survives invalid model output (%s) with an empty, valid answer',
    async (_label, output) => {
      askStructured.mockResolvedValue(output);
      await expect(search()).resolves.toMatchObject({ results: [] });
    },
  );

  it('hands the caller signal to the provider so a cancelled request stops the call', async () => {
    const controller = new AbortController();
    askStructured.mockResolvedValue({ results: [] });
    await search(controller.signal);
    const [[call]] = askStructured.mock.calls as Array<
      [{ signal?: AbortSignal }]
    >;
    expect(call.signal).toBe(controller.signal);
  });

  it('does not call the provider for a person who is over their simultaneous budget, and frees the slot after', async () => {
    const pending: Array<(value: unknown) => void> = [];
    askStructured.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const running = Array.from({ length: ASSISTANT_MAX_CONCURRENT }, () =>
      search(),
    );
    // Let the running calls reach the provider.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(askStructured).toHaveBeenCalledTimes(ASSISTANT_MAX_CONCURRENT);

    await expect(search()).rejects.toMatchObject({
      status: 429,
    } as Partial<HttpException>);
    expect(askStructured).toHaveBeenCalledTimes(ASSISTANT_MAX_CONCURRENT);
    // Someone else is not affected.
    askStructured.mockResolvedValueOnce({ results: [] });
    await expect(search(undefined, 2)).resolves.toBeDefined();

    pending.forEach((resolve) => resolve({ results: [] }));
    await Promise.all(running);
    askStructured.mockResolvedValue({ results: [] });
    await expect(search()).resolves.toBeDefined();
  });

  it('frees the slot when the provider fails', async () => {
    askStructured.mockRejectedValue(new StructuredAskUnavailableError());
    for (let index = 0; index < ASSISTANT_MAX_CONCURRENT + 2; index++) {
      await expect(search()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });
});
