import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { NativeWorkerFactory } from '../src/messaging/native-worker/native-worker.factory';
import { NativeWorkerData } from '../src/messaging/native-worker/native-worker.protocol';

export class TestNativeWorkerFactory extends NativeWorkerFactory {
  readonly threads: Worker[] = [];
  constructor(private readonly mode: 'simulated' | 'provider-failure') {
    super();
  }

  create(data: NativeWorkerData): Worker {
    const entry =
      this.mode === 'simulated'
        ? 'pipeline-simulated-worker.ts'
        : 'pipeline-provider-failure-worker.ts';
    const worker = new Worker(join(__dirname, entry), {
      workerData: data,
      execArgv: ['-r', 'ts-node/register/transpile-only'],
      env: {},
    });
    this.threads.push(worker);
    return worker;
  }

  releaseFailure(): void {
    for (const thread of this.threads)
      thread.postMessage('release-provider-failure');
  }
}
