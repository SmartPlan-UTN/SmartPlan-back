import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isMainThread, parentPort } from 'node:worker_threads';
import { WorkerModule } from './messaging/worker/worker.module';
import type {
  WorkerThreadCommand,
  WorkerThreadEvent,
} from './messaging/worker/worker-thread-protocol';

/**
 * Entry point of the RabbitMQ worker. It runs in two shapes:
 *
 * - As its own process (`start:worker*`), the way it scales independently.
 * - As a `worker_thread` spawned by the API (`WORKER_THREAD_ENABLED`). Signals
 *   only reach the main thread and `process.exitCode` ends nothing there, so
 *   readiness, failure and shutdown go through `parentPort` instead.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    abortOnError: false,
  });

  if (isMainThread) {
    app.enableShutdownHooks();
  } else {
    parentPort?.on('message', (command: WorkerThreadCommand) => {
      if (command.type === 'shutdown') {
        void app.close().finally(() => process.exit(0));
      }
    });
  }

  new Logger('Worker').log('Worker of SmartPlan iniciado. Esperando jobs.');
  notifyParent({ type: 'ready' });
}

function notifyParent(event: WorkerThreadEvent): void {
  parentPort?.postMessage(event);
}

void bootstrap().catch((error: unknown) => {
  new Logger('Worker').error(
    'The worker could not be initialized.',
    error instanceof Error ? error.stack : String(error),
  );
  notifyParent({
    type: 'failed',
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
