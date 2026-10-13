import {
  generationSignal,
  generationNow,
  remainingGenerationMs,
  withGenerationClock,
  withinGenerationDeadline,
} from './generation-deadline';

describe('generation deadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([-120000, 120000])(
    'keeps the database deadline with a host skew of %i ms',
    async (skew) => {
      const databaseNow = new Date(Date.now() + skew);
      const requestedAt = new Date(databaseNow.getTime() - 29000);
      const result = withGenerationClock(
        () => Promise.resolve([{ now: databaseNow }]),
        () => {
          expect(generationNow()).toBe(databaseNow.getTime());
          expect(remainingGenerationMs(requestedAt)).toBe(1000);
          return withinGenerationDeadline(
            requestedAt,
            () => new Promise(() => undefined),
          );
        },
      );
      const failure = expect(result).rejects.toThrow('GENERATION_TIMEOUT');
      await jest.advanceTimersByTimeAsync(1000);
      await failure;
      expect(generationNow()).toBe(Date.now());
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('does not execute after clock acquisition times out', async () => {
    let resolve!: (rows: { now: Date }[]) => void;
    const execute = jest.fn();
    const result = withGenerationClock(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
      execute,
    );
    const failure = expect(result).rejects.toThrow('GENERATION_TIMEOUT');
    await jest.advanceTimersByTimeAsync(30000);
    await failure;
    resolve([{ now: new Date() }]);
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it('counts queue time and aborts all work at the original deadline', async () => {
    let signal: AbortSignal | undefined;
    const result = withinGenerationDeadline(
      new Date(Date.now() - 29000),
      () => {
        signal = generationSignal();
        return new Promise(() => undefined);
      },
    );
    const failure = expect(result).rejects.toThrow('GENERATION_TIMEOUT');
    await jest.advanceTimersByTimeAsync(1000);
    await failure;
    expect(signal?.aborted).toBe(true);
    expect(generationSignal()).toBeUndefined();
  });

  it('does not start providers for expired requests', async () => {
    const execute = jest.fn();
    await expect(
      withinGenerationDeadline(new Date(Date.now() - 30000), execute),
    ).rejects.toThrow('GENERATION_TIMEOUT');
    expect(execute).not.toHaveBeenCalled();
  });

  it('isolates concurrent request cancellation and clears completed timers', async () => {
    const short = withinGenerationDeadline(
      new Date(Date.now() - 29999),
      () => new Promise(() => undefined),
    );
    const failure = expect(short).rejects.toThrow('GENERATION_TIMEOUT');
    await expect(
      withinGenerationDeadline(new Date(), () => Promise.resolve('done')),
    ).resolves.toBe('done');
    await jest.advanceTimersByTimeAsync(1);
    await failure;
    expect(jest.getTimerCount()).toBe(0);
  });
});
