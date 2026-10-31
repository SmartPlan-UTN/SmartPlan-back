import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** Calls one person may start per rolling minute across the three endpoints. */
export const ASSISTANT_MAX_PER_MINUTE = 30;
/** Provider calls one person may have in flight at the same time. */
export const ASSISTANT_MAX_CONCURRENT = 3;
const WINDOW_MS = 60_000;

/**
 * Protects the paid provider behind the composer's assistant from a client
 * that loops, a script, or simply a very eager typist: a rolling per-person
 * budget plus a cap on simultaneous calls. It is in memory, so it holds per
 * API instance (the API runs as a single instance today); a shared store is
 * the next step if that changes. The composer treats a refusal like any other
 * unavailability and keeps working with its regular search.
 */
@Injectable()
export class AssistantLimiter {
  private readonly starts = new Map<number, number[]>();
  private readonly inFlight = new Map<number, number>();
  private acquisitions = 0;

  /** Reserves a call for `userId`, or throws 429. Always call the returned release. */
  acquire(userId: number, now = Date.now()): () => void {
    // Forget people who went quiet so the maps do not grow without bound.
    if (++this.acquisitions % 200 === 0) this.sweep(now);
    const recent = (this.starts.get(userId) ?? []).filter(
      (startedAt) => now - startedAt < WINDOW_MS,
    );
    const running = this.inFlight.get(userId) ?? 0;
    if (
      recent.length >= ASSISTANT_MAX_PER_MINUTE ||
      running >= ASSISTANT_MAX_CONCURRENT
    ) {
      this.starts.set(userId, recent);
      throw new HttpException(
        {
          code: 'ASSISTANT_RATE_LIMITED',
          message: 'Too many assistant requests; try again in a moment',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.starts.set(userId, recent);
    this.inFlight.set(userId, running + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.inFlight.get(userId) ?? 1) - 1;
      if (left <= 0) this.inFlight.delete(userId);
      else this.inFlight.set(userId, left);
    };
  }

  private sweep(now: number): void {
    for (const [userId, starts] of this.starts) {
      const idle = !this.inFlight.has(userId);
      if (idle && starts.every((startedAt) => now - startedAt >= WINDOW_MS)) {
        this.starts.delete(userId);
      }
    }
  }
}
