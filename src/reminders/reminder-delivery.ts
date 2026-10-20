import { EmailDeliveryError } from '../auth/email/email.service';

/** First retry after 5 minutes, then x3 each time, never more than 6 hours. */
const FIRST_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

/** A claimed reminder not finished within this window is reclaimed. */
export const SENDING_LOCK_MINUTES = 10;

const MAX_ERROR_LENGTH = 500;

/** Delay before the attempt after `attemptsDone` failed attempts. */
export function retryDelayMs(attemptsDone: number): number {
  const exponent = Math.max(0, attemptsDone - 1);
  return Math.min(FIRST_RETRY_DELAY_MS * 3 ** exponent, MAX_RETRY_DELAY_MS);
}

export type FailureDecision =
  | { outcome: 'retry'; delayMs: number; error: string }
  | { outcome: 'failed'; error: string };

/**
 * What to do with a reminder whose send just failed. Only a provider error
 * marked retryable (rate limit, outage, network) earns another attempt, and
 * only while attempts remain; anything else is a permanent failure that is
 * recorded, never reported as delivered.
 */
export function decideAfterFailure(
  error: unknown,
  attemptsDone: number,
  maxAttempts: number,
): FailureDecision {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, MAX_ERROR_LENGTH);
  const retryable = error instanceof EmailDeliveryError && error.retryable;

  if (retryable && attemptsDone < maxAttempts) {
    return {
      outcome: 'retry',
      delayMs: retryDelayMs(attemptsDone),
      error: message,
    };
  }

  return {
    outcome: 'failed',
    error: (retryable ? `attempts exhausted: ${message}` : message).slice(
      0,
      MAX_ERROR_LENGTH,
    ),
  };
}
