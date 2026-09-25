export class RetryableJobError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RetryableJobError';
  }
}
