import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { NativeWorkerData } from './native-worker.protocol';

@Injectable()
export class NativeWorkerFactory {
  create(data: NativeWorkerData): Worker {
    const extension = __filename.endsWith('.ts') ? 'ts' : 'js';
    return new Worker(join(__dirname, `../../worker.${extension}`), {
      workerData: data,
      execArgv:
        extension === 'ts' ? ['-r', 'ts-node/register/transpile-only'] : [],
      // Do not copy JWT, email or storage credentials into the consumer thread.
      env: {},
    });
  }
}
