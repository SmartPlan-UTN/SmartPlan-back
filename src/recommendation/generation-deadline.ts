import { AsyncLocalStorage } from 'node:async_hooks';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';

export const GENERATION_TIMEOUT_MS = 30_000;
const context = new AsyncLocalStorage<AbortSignal>();
const clockOffset = new AsyncLocalStorage<number>();

/** PostgreSQL is the clock authority across API and worker hosts. */
export function generationNow(): number {
  return Date.now() + (clockOffset.getStore() ?? 0);
}

export async function withGenerationClock<T>(
  readClock: () => Promise<{ now: Date }[]>,
  execute: () => Promise<T>,
): Promise<T> {
  // Clock acquisition is bounded too, so a stalled database cannot strand POSTs.
  return withinGenerationDeadline(new Date(), async () => {
    const signal = generationSignal();
    const [row] = await readClock();
    if (signal?.aborted) throw new GenerationTimeoutError();
    const offset = new Date(row.now).getTime() - Date.now();
    return clockOffset.run(offset, execute);
  });
}

export class GenerationTimeoutError extends PermanentJobError {
  constructor() {
    super(JSON.stringify({ code: 'GENERATION_TIMEOUT' }));
  }
}

export function remainingGenerationMs(requestedAt: Date): number {
  return Math.max(
    0,
    requestedAt.getTime() + GENERATION_TIMEOUT_MS - generationNow(),
  );
}

export function assertGenerationTime(requestedAt: Date): void {
  if (remainingGenerationMs(requestedAt) === 0)
    throw new GenerationTimeoutError();
}

/** Shared by this request's provider calls, including parallel routes. */
export function generationSignal(): AbortSignal | undefined {
  return context.getStore();
}

export async function withinGenerationDeadline<T>(
  requestedAt: Date,
  execute: () => Promise<T>,
): Promise<T> {
  assertGenerationTime(requestedAt);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GenerationTimeoutError());
    }, remainingGenerationMs(requestedAt));
  });
  try {
    return await context.run(controller.signal, () =>
      Promise.race([execute(), expired]),
    );
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
