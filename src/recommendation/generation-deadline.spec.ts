import {
  generationSignal,
  withinGenerationDeadline,
} from './generation-deadline';

describe('generation deadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
