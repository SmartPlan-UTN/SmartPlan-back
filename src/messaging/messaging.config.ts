import { ConfigService } from '@nestjs/config';
import {
  MessageHandlerErrorBehavior,
  RabbitMQConfig,
  RabbitMQQueueConfig,
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
  GENERATE_PLAN_REQUEST_QUEUE,
  GENERATE_PLAN_REQUEST_ROUTING_KEY,
  FAILED_GENERATE_PLAN_REQUEST_QUEUE,
  FAILED_GENERATE_PLAN_REQUEST_ROUTING_KEY,
  EXTERNAL_SYNC_QUEUE,
  EXTERNAL_SYNC_ROUTING_KEY,
  FAILED_EXTERNAL_SYNC_QUEUE,
  FAILED_EXTERNAL_SYNC_ROUTING_KEY,
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
      ...buildJobQueues(
        EXAMPLE_QUEUE,
        EXAMPLE_ROUTING_KEY,
        FAILED_EXAMPLE_QUEUE,
        FAILED_EXAMPLE_ROUTING_KEY,
        retryDelaysMs,
      ),
      ...buildJobQueues(
        GENERATE_PLAN_REQUEST_QUEUE,
        GENERATE_PLAN_REQUEST_ROUTING_KEY,
        FAILED_GENERATE_PLAN_REQUEST_QUEUE,
        FAILED_GENERATE_PLAN_REQUEST_ROUTING_KEY,
        retryDelaysMs,
      ),
      ...buildJobQueues(
        EXTERNAL_SYNC_QUEUE,
        EXTERNAL_SYNC_ROUTING_KEY,
        FAILED_EXTERNAL_SYNC_QUEUE,
        FAILED_EXTERNAL_SYNC_ROUTING_KEY,
        retryDelaysMs,
      ),
    ],
  };
}

function buildJobQueues(
  queue: string,
  routingKey: string,
  failedQueueName: string,
  failedRoutingKeyName: string,
  retryDelaysMs: number[],
): RabbitMQQueueConfig[] {
  const primaryQueue: RabbitMQQueueConfig = {
    name: queue,
    exchange: JOBS_EXCHANGE,
    routingKey,
    createQueueIfNotExists: true,
    options: { durable: true },
  };

  return [
    primaryQueue,
    ...retryDelaysMs.map((delayMs, index) => {
      const attempt = index + 1;
      return {
        name: retryQueue(queue, attempt),
        exchange: RETRY_EXCHANGE,
        routingKey: retryRoutingKey(routingKey, attempt),
        createQueueIfNotExists: true,
        options: {
          durable: true,
          messageTtl: delayMs,
          deadLetterExchange: JOBS_EXCHANGE,
          deadLetterRoutingKey: routingKey,
        },
      };
    }),
    {
      name: failedQueueName,
      exchange: FAILED_EXCHANGE,
      routingKey: failedRoutingKeyName,
      createQueueIfNotExists: true,
      options: { durable: true },
    },
  ];
}
