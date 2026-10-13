/** Messages the worker thread sends to the API that spawned it. */
export type WorkerThreadEvent =
  | { type: 'ready' }
  | { type: 'failed'; message: string };

/** Messages the API sends to the worker thread. */
export type WorkerThreadCommand = { type: 'shutdown' };
