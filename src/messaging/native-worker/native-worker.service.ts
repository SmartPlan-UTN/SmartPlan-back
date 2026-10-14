import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'node:worker_threads';
import { DataSource } from 'typeorm';
import { CommonEnvironmentVariables } from '../../config/environment-variables';
import { NativeWorkerFactory } from './native-worker.factory';
import { NativeWorkerEvent } from './native-worker.protocol';

const WORKER_CONFIGURATION_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'DB_SSL',
  'RABBITMQ_URL',
  'RABBITMQ_PREFETCH',
  'RABBITMQ_MAX_ATTEMPTS',
  'RABBITMQ_RETRY_DELAYS_MS',
  'GOOGLE_MAPS_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_MODEL_INTENT',
] as const;
const STARTUP_TIMEOUT_MS = 30_000;

/** One API-owned thread consumes RabbitMQ and runs the existing worker module. */
@Injectable()
export class NativeWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NativeWorkerService.name);
  private worker?: Worker;
  private ready = false;
  private stopping = false;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private restartAttempts = 0;

  constructor(
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
    private readonly factory: NativeWorkerFactory,
    private readonly dataSource: DataSource,
  ) {}

  isReady(): boolean {
    return this.ready && !this.stopping;
  }

  async onApplicationBootstrap(): Promise<void> {
    // This deployment has exactly one API instance; interrupted work is not resumed.
    await this.interruptOutstandingJobs();
    try {
      await this.startThread();
    } catch (error) {
      await this.onModuleDestroy();
      throw error;
    }
  }

  private startThread(): Promise<void> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.factory.create({
          configuration: Object.fromEntries(
            WORKER_CONFIGURATION_KEYS.map((key) => [
              key,
              this.configuration.get(key, { infer: true }),
            ]),
          ),
        });
      } catch {
        reject(new Error('Could not create the native worker thread'));
        this.scheduleRestart();
        return;
      }
      this.worker = worker;
      const failed = (): void => {
        reject(new Error('The native worker thread failed to start'));
        void this.handleFailure(worker);
      };
      this.startupTimer = setTimeout(failed, STARTUP_TIMEOUT_MS);
      worker.on('message', (event: NativeWorkerEvent) => {
        if (this.worker !== worker || this.stopping || event.kind !== 'ready')
          return;
        clearTimeout(this.startupTimer);
        this.ready = true;
        this.restartAttempts = 0;
        this.logger.log({
          event: 'native_worker_ready',
          threadId: worker.threadId,
        });
        resolve();
      });
      worker.on('error', failed);
      worker.on('exit', failed);
    });
  }

  private async handleFailure(worker: Worker): Promise<void> {
    if (this.worker !== worker) return;
    this.worker = undefined;
    this.ready = false;
    clearTimeout(this.startupTimer);
    // Stop all writes before marking requests failed or starting another consumer.
    await worker.terminate().catch(() => undefined);
    if (this.stopping) return;
    this.logger.error({ event: 'native_worker_interrupted' });
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.stopping) return;
    const delayMs = Math.min(
      30_000,
      1000 * 2 ** Math.min(this.restartAttempts++, 5),
    );
    this.restartTimer = setTimeout(() => {
      void this.restart().catch(() => {
        this.logger.error({ event: 'native_worker_restart_failed' });
      });
    }, delayMs);
  }

  private async restart(): Promise<void> {
    if (this.stopping) return;
    try {
      await this.interruptOutstandingJobs();
    } catch {
      this.logger.error({ event: 'native_worker_cleanup_failed' });
      this.scheduleRestart();
      return;
    }
    if (!this.stopping) await this.startThread();
  }

  private async interruptOutstandingJobs(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE plan_request SET
           id_request_status = (SELECT id FROM request_status WHERE key = 'failed'),
           failure_code = 'WORKER_INTERRUPTED', failure_detail = '{}'::jsonb,
           failed_at = clock_timestamp()
         WHERE id_request_status IN
           (SELECT id FROM request_status WHERE key IN ('pending', 'processing'))
           AND deleted_at IS NULL`,
      );
      await manager.query(
        `UPDATE external_sync SET status = 'failed', ended_at = clock_timestamp(),
           error_message = 'The API worker was interrupted before completion.'
         WHERE status = 'running' AND deleted_at IS NULL`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.ready = false;
    clearTimeout(this.restartTimer);
    clearTimeout(this.startupTimer);
    const worker = this.worker;
    this.worker = undefined;
    await worker?.terminate().catch(() => undefined);
    // Shutdown may already have closed TypeORM; startup performs durable cleanup.
  }
}
