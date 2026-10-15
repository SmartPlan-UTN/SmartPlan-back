import { HttpException } from '@nestjs/common';
import {
  ASSISTANT_MAX_CONCURRENT,
  ASSISTANT_MAX_PER_MINUTE,
  AssistantLimiter,
} from './assistant-limiter';

describe('AssistantLimiter', () => {
  let limiter: AssistantLimiter;
  const status = (action: () => unknown): number | null => {
    try {
      action();
      return null;
    } catch (error) {
      return error instanceof HttpException ? error.getStatus() : -1;
    }
  };

  beforeEach(() => {
    limiter = new AssistantLimiter();
  });

  it('refuses calls beyond the per-minute budget with 429, and recovers after the window', () => {
    const t0 = 1_000_000;
    for (let index = 0; index < ASSISTANT_MAX_PER_MINUTE; index++) {
      limiter.acquire(1, t0)();
    }
    expect(status(() => limiter.acquire(1, t0 + 1))).toBe(429);
    // A minute later the budget is back.
    expect(status(() => limiter.acquire(1, t0 + 60_001))).toBeNull();
  });

  it('caps simultaneous calls and frees the slot on release', () => {
    const releases = Array.from({ length: ASSISTANT_MAX_CONCURRENT }, () =>
      limiter.acquire(1),
    );
    expect(status(() => limiter.acquire(1))).toBe(429);
    releases[0]();
    expect(status(() => limiter.acquire(1))).toBeNull();
  });

  it('releasing twice does not free a second slot', () => {
    const releases = Array.from({ length: ASSISTANT_MAX_CONCURRENT }, () =>
      limiter.acquire(1),
    );
    releases[0]();
    releases[0]();
    limiter.acquire(1);
    expect(status(() => limiter.acquire(1))).toBe(429);
  });

  it('budgets each person on their own', () => {
    for (let index = 0; index < ASSISTANT_MAX_CONCURRENT; index++) {
      limiter.acquire(1);
    }
    expect(status(() => limiter.acquire(1))).toBe(429);
    expect(status(() => limiter.acquire(2))).toBeNull();
  });

  it('answers with a stable code the client can recognise', () => {
    for (let index = 0; index < ASSISTANT_MAX_CONCURRENT; index++) {
      limiter.acquire(1);
    }
    try {
      limiter.acquire(1);
      fail('expected a refusal');
    } catch (error) {
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'ASSISTANT_RATE_LIMITED',
      });
    }
  });
});
