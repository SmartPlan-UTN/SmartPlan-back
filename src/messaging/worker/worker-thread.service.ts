import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { EnvironmentVariables } from '../../config/environment-variables';
import type {
  WorkerThreadCommand,
  WorkerThreadEvent,
} from './worker-thread-protocol';

export const WORKER_READY_TIMEOUT_MS = 20_000;
export const WORKER_SHUTDOWN_TIMEOUT_MS = 10_000;
export const WORKER_MAX_RESTARTS = 5;
const RESTART_BASE_DELAY_MS = 1_000;
const RESTART_MAX_DELAY_MS = 30_000;

/**
 * Runs the RabbitMQ worker (`src/worker.ts`) as a `worker_thread` of the API
 * process when `WORKER_THREAD_ENABLED` is set. The thread has its own event
 * loop, TypeORM pool and AMQP connection, so job processing never competes
 * with HTTP handling for the main thread. A crash is contained to the thread
 * and retried with exponential backoff instead of taking the API down.
 */
@Injectable()
export class WorkerThreadService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerThreadService.name);
  private worker?: Worker;
  private stopping = false;
  private consecutiveFailures = 0;
  private restartTimer?: NodeJS.Timeout;

  constructor(
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.configuration.get('WORKER_THREAD_ENABLED', { infer: true })) {
      return;
    }
    this.spawn();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.restartTimer);

    const worker = this.worker;
    if (!worker) {
      return;
    }

    await new Promise<void>((resolve) => {
      const forceTimer = setTimeout(() => {
        this.logger.warn('Worker thread did not stop in time; terminating it.');
        void worker.terminate();
      }, WORKER_SHUTDOWN_TIMEOUT_MS);

      worker.once('exit', () => {
        clearTimeout(forceTimer);
        resolve();
      });
      worker.postMessage({ type: 'shutdown' } satisfies WorkerThreadCommand);
    });
  }

  private spawn(): void {
    const worker = new Worker(join(__dirname, '..', '..', 'worker.js'));
    this.worker = worker;

    const readyTimer = setTimeout(() => {
      this.logger.error(
        `Worker thread was not ready after ${WORKER_READY_TIMEOUT_MS} ms; terminating it.`,
      );
      void worker.terminate();
    }, WORKER_READY_TIMEOUT_MS);

    worker.on('message', (event: WorkerThreadEvent) => {
      if (event.type === 'ready') {
        clearTimeout(readyTimer);
        this.consecutiveFailures = 0;
        this.logger.log('Worker thread is ready.');
      } else {
        this.logger.error(`Worker thread failed to start: ${event.message}`);
        void worker.terminate();
      }
    });

    worker.on('error', (error: Error) => {
      this.logger.error(`Worker thread error: ${error.message}`, error.stack);
    });

    worker.on('exit', (code) => {
      clearTimeout(readyTimer);
      if (this.worker === worker) {
        this.worker = undefined;
      }
      if (!this.stopping) {
        this.scheduleRestart(code);
      }
    });
  }

  private scheduleRestart(exitCode: number): void {
    this.consecutiveFailures += 1;

    if (this.consecutiveFailures > WORKER_MAX_RESTARTS) {
      this.logger.error(
        `Worker thread exited (code ${exitCode}) ${this.consecutiveFailures} times in a row; giving up. Restart the API or run the standalone worker.`,
      );
      return;
    }

    const delayMs = Math.min(
      RESTART_BASE_DELAY_MS * 2 ** (this.consecutiveFailures - 1),
      RESTART_MAX_DELAY_MS,
    );
    this.logger.warn(
      `Worker thread exited (code ${exitCode}); restarting in ${delayMs} ms (attempt ${this.consecutiveFailures}/${WORKER_MAX_RESTARTS}).`,
    );
    this.restartTimer = setTimeout(() => this.spawn(), delayMs);
  }
}
