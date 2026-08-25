import { ConfigService } from '@nestjs/config';
import { MessageHandlerErrorBehavior } from '@golevelup/nestjs-rabbitmq';
import { buildMessagingOptions, readRetryParameters } from './messaging.config';
import {
  EXAMPLE_QUEUE,
  FAILED_EXAMPLE_QUEUE,
  retryQueue,
  FAILED_EXCHANGE,
  RETRY_EXCHANGE,
  JOBS_EXCHANGE,
} from './constants';
import {
  validateAgainst,
  CommonEnvironmentVariables,
} from '../config/environment-variables';

function configFrom(
  environment: Record<string, string>,
): ConfigService<CommonEnvironmentVariables, true> {
  return new ConfigService<CommonEnvironmentVariables, true>(
    validateAgainst(CommonEnvironmentVariables, environment),
  );
}

describe('buildMessagingOptions', () => {
  it('declares the three durable direct exchanges', () => {
    const options = buildMessagingOptions(configFrom({}));

    expect(options.exchanges).toEqual(
      expect.arrayContaining([
        { name: JOBS_EXCHANGE, type: 'direct', options: { durable: true } },
        {
          name: RETRY_EXCHANGE,
          type: 'direct',
          options: { durable: true },
        },
        { name: FAILED_EXCHANGE, type: 'direct', options: { durable: true } },
      ]),
    );
  });

  it('declares the main queue bound to the jobs exchange without a dead-letter exchange', () => {
    const options = buildMessagingOptions(configFrom({}));
    const primaryQueue = options.queues?.find((q) => q.name === EXAMPLE_QUEUE);

    expect(primaryQueue).toMatchObject({
      exchange: JOBS_EXCHANGE,
      routingKey: 'example.execute',
    });
    expect(primaryQueue?.options?.deadLetterExchange).toBeUndefined();
  });

  it('declares retry queues with TTL and a dead-letter exchange back to the main queue', () => {
    const options = buildMessagingOptions(
      configFrom({ RABBITMQ_RETRY_DELAYS_MS: '5000,30000' }),
    );

    const retry1 = options.queues?.find(
      (q) => q.name === retryQueue(EXAMPLE_QUEUE, 1),
    );
    const retry2 = options.queues?.find(
      (q) => q.name === retryQueue(EXAMPLE_QUEUE, 2),
    );

    expect(retry1?.options).toMatchObject({
      messageTtl: 5000,
      deadLetterExchange: JOBS_EXCHANGE,
      deadLetterRoutingKey: 'example.execute',
    });
    expect(retry2?.options).toMatchObject({
      messageTtl: 30000,
      deadLetterExchange: JOBS_EXCHANGE,
      deadLetterRoutingKey: 'example.execute',
    });
  });

  it('declares exactly a queue of retry by delay configured', () => {
    const options = buildMessagingOptions(
      configFrom({
        RABBITMQ_MAX_ATTEMPTS: '4',
        RABBITMQ_RETRY_DELAYS_MS: '5000,30000,60000',
      }),
    );

    const retryQueues = options.queues?.filter((q) =>
      q.name.startsWith(`${EXAMPLE_QUEUE}.retry.`),
    );

    expect(retryQueues).toHaveLength(3);
    expect(retryQueues?.map((q) => q.name)).toEqual([
      retryQueue(EXAMPLE_QUEUE, 1),
      retryQueue(EXAMPLE_QUEUE, 2),
      retryQueue(EXAMPLE_QUEUE, 3),
    ]);
  });

  it('declares the queue of failed without TTL nor dead letter exchange', () => {
    const options = buildMessagingOptions(configFrom({}));
    const dlq = options.queues?.find((q) => q.name === FAILED_EXAMPLE_QUEUE);

    expect(dlq).toMatchObject({
      exchange: FAILED_EXCHANGE,
      routingKey: 'example.execute.dlq',
    });
    expect(dlq?.options?.messageTtl).toBeUndefined();
    expect(dlq?.options?.deadLetterExchange).toBeUndefined();
  });

  it('applies default values when the environment defines none', () => {
    const options = buildMessagingOptions(configFrom({}));

    expect(options.prefetchCount).toBe(1);
    expect(options.uri).toBe('amqp://smartplan:smartplan@localhost:5672');
  });

  it('converts environment string values to numbers', () => {
    const options = buildMessagingOptions(
      configFrom({ RABBITMQ_PREFETCH: '5' }),
    );

    expect(options.prefetchCount).toBe(5);
    expect(typeof options.prefetchCount).toBe('number');
  });

  it('uses NACK as the default behavior on handler errors', () => {
    const options = buildMessagingOptions(configFrom({}));

    expect(options.defaultSubscribeErrorBehavior).toBe(
      MessageHandlerErrorBehavior.NACK,
    );
  });

  it('marks messages as persistent by default', () => {
    const options = buildMessagingOptions(configFrom({}));

    expect(options.defaultPublishOptions).toMatchObject({ persistent: true });
  });

  describe('role "producer" (API)', () => {
    it('does not declare the main queue, retry exchanges, retry queues, or DLQ', () => {
      const options = buildMessagingOptions(configFrom({}), 'producer');

      expect(options.queues).toEqual([]);
      expect(options.exchanges).toEqual([
        { name: JOBS_EXCHANGE, type: 'direct', options: { durable: true } },
      ]);
    });

    it('does not declare defaultSubscribeErrorBehavior because the API never consumes', () => {
      const options = buildMessagingOptions(configFrom({}), 'producer');

      expect(options.defaultSubscribeErrorBehavior).toBeUndefined();
    });

    it('continues exposing URI, prefetch, and publish options', () => {
      const options = buildMessagingOptions(configFrom({}), 'producer');

      expect(options.uri).toBe('amqp://smartplan:smartplan@localhost:5672');
      expect(options.defaultPublishOptions).toMatchObject({
        persistent: true,
      });
    });
  });

  describe('trampa of cache: true — ConfigService returns strings raw', () => {
    it('coerciona a prefetch in string a number', () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'RABBITMQ_PREFETCH') return '2';
          return undefined;
        }),
      } as unknown as ConfigService<CommonEnvironmentVariables, true>;

      const options = buildMessagingOptions(configMock);

      expect(options.prefetchCount).toBe(2);
    });

    it('applies the fallback when get returns undefined', () => {
      const configMock = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService<CommonEnvironmentVariables, true>;

      const { maxAttempts, retryDelaysMs } = readRetryParameters(configMock);

      expect(maxAttempts).toBe(3);
      expect(retryDelaysMs).toEqual([5000, 30000]);
    });
  });
});
