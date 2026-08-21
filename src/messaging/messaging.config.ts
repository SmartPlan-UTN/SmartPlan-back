import { ConfigService } from '@nestjs/config';
import {
  MessageHandlerErrorBehavior,
  RabbitMQConfig,
} from '@golevelup/nestjs-rabbitmq';
import { CommonEnvironmentVariables } from '../config/environment-variables';
import {
  EXAMPLE_QUEUE,
  FAILED_EXAMPLE_QUEUE,
  retryQueue,
  FAILED_EXCHANGE,
  RETRY_EXCHANGE,
  JOBS_EXCHANGE,
  EXAMPLE_ROUTING_KEY,
  FAILED_EXAMPLE_ROUTING_KEY,
  retryRoutingKey,
} from './constants';

type MessagingConfiguration = ConfigService<CommonEnvironmentVariables, true>;

export const PUBLISH_TIMEOUT_MS = 10_000;

export function readRetryParameters(config: MessagingConfiguration): {
  maxAttempts: number;
  retryDelaysMs: number[];
} {
  const maxAttempts = Number(
    config.get('RABBITMQ_MAX_ATTEMPTS', { infer: true }) ?? 3,
  );
  const retryDelaysMs = String(
    config.get('RABBITMQ_RETRY_DELAYS_MS', { infer: true }) ?? '5000,30000',
  )
    .split(',')
    .map(Number);

  return { maxAttempts, retryDelaysMs };
}

export type MessagingRole = 'producer' | 'worker';

export function buildMessagingOptions(
  config: MessagingConfiguration,
  role: MessagingRole = 'worker',
): RabbitMQConfig {
  const uri =
    config.get('RABBITMQ_URL', { infer: true }) ??
    'amqp://smartplan:smartplan@localhost:5672';
  const prefetchCount = Number(
    config.get('RABBITMQ_PREFETCH', { infer: true }) ?? 1,
  );

  if (role === 'producer') {
    return {
      uri,
      connectionInitOptions: { wait: true, timeout: 10000, reject: true },
      defaultPublishOptions: { persistent: true },
      prefetchCount,
      exchanges: [
        {
          name: JOBS_EXCHANGE,
          type: 'direct',
          options: { durable: true },
        },
      ],
      queues: [],
    };
  }

  const { retryDelaysMs } = readRetryParameters(config);

  const primaryQueue = {
    name: EXAMPLE_QUEUE,
    exchange: JOBS_EXCHANGE,
    routingKey: EXAMPLE_ROUTING_KEY,
    createQueueIfNotExists: true,
    options: { durable: true },
  };

  return {
    uri,
    connectionInitOptions: { wait: true, timeout: 10000, reject: true },
    defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK,
    defaultPublishOptions: { persistent: true },
    prefetchCount,
    exchanges: [
      { name: JOBS_EXCHANGE, type: 'direct', options: { durable: true } },
      {
        name: RETRY_EXCHANGE,
        type: 'direct',
        options: { durable: true },
      },
      { name: FAILED_EXCHANGE, type: 'direct', options: { durable: true } },
    ],
    queues: [
      primaryQueue,
      ...retryDelaysMs.map((delayMs, index) => {
        const attempt = index + 1;
        return {
          name: retryQueue(EXAMPLE_QUEUE, attempt),
          exchange: RETRY_EXCHANGE,
          routingKey: retryRoutingKey(EXAMPLE_ROUTING_KEY, attempt),
          createQueueIfNotExists: true,
          options: {
            durable: true,
            messageTtl: delayMs,
            deadLetterExchange: JOBS_EXCHANGE,
            deadLetterRoutingKey: EXAMPLE_ROUTING_KEY,
          },
        };
      }),
      {
        name: FAILED_EXAMPLE_QUEUE,
        exchange: FAILED_EXCHANGE,
        routingKey: FAILED_EXAMPLE_ROUTING_KEY,
        createQueueIfNotExists: true,
        options: { durable: true },
      },
    ],
  };
}
