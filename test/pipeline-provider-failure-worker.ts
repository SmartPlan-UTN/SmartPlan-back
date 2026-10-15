import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PermanentJobError } from '../src/messaging/errors/permanent-job-error';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { WorkerModule } from '../src/messaging/worker/worker.module';
import { parentPort, workerData } from 'node:worker_threads';
import {
  NativeWorkerData,
  NativeWorkerEvent,
} from '../src/messaging/native-worker/native-worker.protocol';

// The parent releases the controlled failure after observing processing over HTTP.
const releaseFailure = new Promise<void>((resolve) => {
  parentPort?.on('message', (message: unknown) => {
    if (message === 'release-provider-failure') resolve();
  });
});

const providerDenied = async (): Promise<never> => {
  await releaseFailure;
  throw new PermanentJobError(
    JSON.stringify({
      code: 'GENERATION_PROVIDER_UNAVAILABLE',
      provider: 'gemini',
    }),
  );
};

async function bootstrap(): Promise<void> {
  if (!parentPort) throw new Error('Expected a native worker thread');
  const data = workerData as NativeWorkerData;
  const app = await NestFactory.createApplicationContext(
    WorkerModule.forRoot(data.configuration),
    {
      abortOnError: false,
    },
  );
  const gemini = app.get(GeminiClientService);
  gemini.interpretIntent = providerDenied;
  gemini.composePlans = providerDenied;
  parentPort.postMessage({ kind: 'ready' } satisfies NativeWorkerEvent);
}

void bootstrap().catch((error: unknown) => {
  new Logger('PipelineProviderFailureWorker').error(
    'The worker could not be initialized.',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
