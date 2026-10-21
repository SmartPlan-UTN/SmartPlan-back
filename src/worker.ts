import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './messaging/worker/worker.module';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  NativeWorkerData,
  NativeWorkerEvent,
} from './messaging/native-worker/native-worker.protocol';

async function bootstrap() {
  if (isMainThread || !parentPort) {
    throw new Error(
      'The worker is managed by the API and must run in a native thread.',
    );
  }
  const data = workerData as NativeWorkerData;
  const app = await NestFactory.createApplicationContext(
    WorkerModule.forRoot(data.configuration),
    {
      abortOnError: false,
    },
  );
  // No HTTP server or process signals: the API owns this thread's lifecycle.
  parentPort.on('close', () => {
    void app.close();
  });
  parentPort.postMessage({ kind: 'ready' } satisfies NativeWorkerEvent);
}
void bootstrap().catch((error: unknown) => {
  new Logger('Worker').error(
    'The worker could not be initialized.',
    error instanceof Error ? error.stack : String(error),
  );
  parentPort?.close();
  process.exit(1);
});
