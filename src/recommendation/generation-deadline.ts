import { AsyncLocalStorage } from 'node:async_hooks';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';

export const GENERATION_TIMEOUT_MS = 30_000;
const context = new AsyncLocalStorage<AbortSignal>();

export class GenerationTimeoutError extends PermanentJobError {
  constructor() {
    super(JSON.stringify({ code: 'GENERATION_TIMEOUT' }));
  }
}

export function remainingGenerationMs(requestedAt: Date): number {
  return Math.max(
    0,
    requestedAt.getTime() + GENERATION_TIMEOUT_MS - Date.now(),
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
