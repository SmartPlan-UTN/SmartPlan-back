import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { MessagingService } from '../src/messaging/messaging.service';
import { JobProcessorService } from '../src/messaging/worker/job-processor.service';
import { ExampleHandler } from '../src/messaging/worker/handlers/example.handler';
import { buildMessagingOptions } from '../src/messaging/messaging.config';
import {
  EXAMPLE_QUEUE,
  FAILED_EXAMPLE_QUEUE,
  retryQueue,
} from '../src/messaging/constants';
import { JobType } from '../src/messaging/types/job-type';
import type { CommonEnvironmentVariables } from '../src/config/environment-variables';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

cargarEnv({ quiet: true });

const RABBITMQ_URL_CRUDA = process.env.RABBITMQ_URL;

const RABBITMQ_URL =
  RABBITMQ_URL_CRUDA || 'amqp://smartplan:smartplan@localhost:5672';

const spikeHabilitado = process.env.RUN_RABBITMQ_SPIKE === '1';
const describeSpike = spikeHabilitado ? describe : describe.skip;

function esBrokerLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const DEMORAS_SPIKE_MS = [100, 200];

async function isConnectivityAvailable(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- this dependency is CommonJS-only
  const amqplib = require('amqplib') as {
    connect: (url: string) => Promise<{ close: () => Promise<void> }>;
  };

  let temporizador: NodeJS.Timeout | undefined;

  try {
    const connection = await Promise.race([
      amqplib.connect(RABBITMQ_URL),
      new Promise<never>((_resolve, reject) => {
        temporizador = setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
    await connection.close();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

describeSpike(
  'Spike RabbitMQ — producer → RabbitMQ real → worker (F12, #34)',
  () => {
    let app: INestApplicationContext;
    let publisher: MessagingService;
    let amqp: AmqpConnection;

    function countStarts(idTrabajo: string): number {
      return espiaLog.mock.calls.filter(([objeto]) => {
        const event = objeto as { event?: string; id?: string };
        return event.event === 'job_started' && event.id === idTrabajo;
      }).length;
    }

    let espiaLog: jest.SpiedFunction<typeof Logger.prototype.log>;

    beforeAll(async () => {
      const available = await isConnectivityAvailable();
      if (!available) {
        throw new Error(
          `RabbitMQ is not available at ${RABBITMQ_URL.replace(/\/\/.*@/, '//***:***@')}. ` +
            'Run "pnpm db:up" before running this test.',
        );
      }

      const testConfiguration = {
        get: (key: string) => {
          const valores: Record<string, string> = {
            RABBITMQ_URL,
            RABBITMQ_MAX_ATTEMPTS: '3',
            RABBITMQ_RETRY_DELAYS_MS: DEMORAS_SPIKE_MS.join(','),
          };
          return valores[key];
        },
      } as ConfigService<CommonEnvironmentVariables, true>;

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
          RabbitMQModule.forRoot(buildMessagingOptions(testConfiguration)),
        ],
        providers: [
          MessagingService,
          JobProcessorService,
          ExampleHandler,
          { provide: ConfigService, useValue: testConfiguration },
        ],
      }).compile();

      app = module;

      espiaLog = jest.spyOn(Logger.prototype, 'log');

      await app.init();

      publisher = app.get(MessagingService);
      amqp = app.get(AmqpConnection);
    }, 20_000);

    afterAll(async () => {
      if (!app) {
        return;
      }

      if (!esBrokerLocal(RABBITMQ_URL)) {
        new Logger('SpikeRabbitMQ').warn(
          'RABBITMQ_URL does not point to a local broker; queue cleanup is skipped.',
        );
        await app.close();
        return;
      }

      try {
        await amqp.channel.purgeQueue(FAILED_EXAMPLE_QUEUE);
        for (
          let attempt = 1;
          attempt <= DEMORAS_SPIKE_MS.length;
          attempt += 1
        ) {
          await amqp.channel.deleteQueue(retryQueue(EXAMPLE_QUEUE, attempt));
        }
      } catch (error) {
        new Logger('SpikeRabbitMQ').warn(
          `Unable to clean up the spike topology: ${String(error)}`,
        );
      }

      await app.close();
    });

    it('publishes a job that the worker processes and acknowledges (happy path)', async () => {
      const id = await publisher.publish(JobType.ExecuteExample, {
        message: 'SmartPlan',
      });

      await waitUntil(() => countStarts(id) >= 1, 10_000);

      expect(countStarts(id)).toBe(1);
    }, 15_000);

    it('retries twice with a delay and ends in the failed queue', async () => {
      const id = await publisher.publish(JobType.ExecuteExample, {
        message: 'SmartPlan',
        simulatedFailure: 'retryable',
      });

      await waitUntil(() => countStarts(id) >= 3, 10_000);

      expect(countStarts(id)).toBe(3);

      const dlqMessageCount = await waitForQueueMessageCount(
        amqp,
        FAILED_EXAMPLE_QUEUE,
        1,
        5_000,
      );
      expect(dlqMessageCount).toBe(1);
    }, 20_000);

    it('sends a permanent error to the failed queue without retrying', async () => {
      const id = await publisher.publish(JobType.ExecuteExample, {
        message: 'SmartPlan',
        simulatedFailure: 'permanent',
      });

      await waitUntil(() => countStarts(id) >= 1, 5_000);
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(countStarts(id)).toBe(1);
    }, 15_000);
  },
);

/** Polls until `condition()` returns true or the timeout expires. */
async function waitUntil(
  condition: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const home = Date.now();
  while (!condition()) {
    if (Date.now() - home > timeoutMs) {
      throw new Error(`Timeout waiting for the condition (${timeoutMs}ms)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Waits until a queue contains the expected number of messages. */
async function waitForQueueMessageCount(
  amqp: AmqpConnection,
  queue: string,
  expectedCount: number,
  timeoutMs: number,
): Promise<number> {
  const home = Date.now();
  let quantity = 0;

  while (Date.now() - home < timeoutMs) {
    const info = await amqp.channel.checkQueue(queue);
    quantity = info.messageCount;
    if (quantity >= expectedCount) {
      return quantity;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return quantity;
}
