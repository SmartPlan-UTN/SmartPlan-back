export class PermanentJobError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
