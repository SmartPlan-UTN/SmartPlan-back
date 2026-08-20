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

/** Pasa el environment por la misma validación que corre al arrancar la app. */
function configFrom(
  environment: Record<string, string>,
): ConfigService<CommonEnvironmentVariables, true> {
  return new ConfigService<CommonEnvironmentVariables, true>(
    validateAgainst(CommonEnvironmentVariables, environment),
  );
}

describe('buildMessagingOptions', () => {
  it('declara los tres exchanges direct y durables', () => {
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

  it('declara la queue principal atada al exchange de jobs, sin dead letter exchange', () => {
    const options = buildMessagingOptions(configFrom({}));
    const primaryQueue = options.queues?.find((q) => q.name === EXAMPLE_QUEUE);

    expect(primaryQueue).toMatchObject({
      exchange: JOBS_EXCHANGE,
      routingKey: 'example.execute',
    });
    expect(primaryQueue?.options?.deadLetterExchange).toBeUndefined();
  });

  it('declara las queues de retry con TTL y dead letter exchange de vuelta a la principal', () => {
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

  it('declara exactamente una queue de retry por demora configurada', () => {
    const options = buildMessagingOptions(
      configFrom({
        RABBITMQ_MAX_INTENTOS: '4',
        RABBITMQ_RETRY_DELAYS_MS: '5000,30000,60000',
      }),
    );

    const retryQueues = options.queues?.filter((q) =>
      q.name.includes('.retry.'),
    );

    expect(retryQueues).toHaveLength(3);
    expect(retryQueues?.map((q) => q.name)).toEqual([
      retryQueue(EXAMPLE_QUEUE, 1),
      retryQueue(EXAMPLE_QUEUE, 2),
      retryQueue(EXAMPLE_QUEUE, 3),
    ]);
  });

  it('declara la queue de failed sin TTL ni dead letter exchange', () => {
    const options = buildMessagingOptions(configFrom({}));
    const dlq = options.queues?.find((q) => q.name === FAILED_EXAMPLE_QUEUE);

    expect(dlq).toMatchObject({
      exchange: FAILED_EXCHANGE,
      routingKey: 'example.execute.dlq',
    });
    expect(dlq?.options?.messageTtl).toBeUndefined();
    expect(dlq?.options?.deadLetterExchange).toBeUndefined();
  });

  it('aplica los valores por defecto cuando el environment no define nada', () => {
    const options = buildMessagingOptions(configFrom({}));

    expect(options.prefetchCount).toBe(1);
    expect(options.uri).toBe('amqp://smartplan:smartplan@localhost:5672');
  });

  it('convierte los valores del environment de string a número', () => {
    const options = buildMessagingOptions(
      configFrom({ RABBITMQ_PREFETCH: '5' }),
    );

    expect(options.prefetchCount).toBe(5);
    expect(typeof options.prefetchCount).toBe('number');
  });

  it('usa NACK como comportamiento por defecto ante error del handler', () => {
    // Protege contra el bug de ACK incondicional (perdía el message si
    // fallaba la republicación) y contra el loop infinito de REQUEUE.
    const options = buildMessagingOptions(configFrom({}));

    expect(options.defaultSubscribeErrorBehavior).toBe(
      MessageHandlerErrorBehavior.NACK,
    );
  });

  it('marca los messages como persistentes por defecto', () => {
    const options = buildMessagingOptions(configFrom({}));

    expect(options.defaultPublishOptions).toMatchObject({ persistent: true });
  });

  describe('role "producer" (API)', () => {
    // Regresión de code review: antes la API declaraba la topología
    // completa (retry/DLQ) aunque nunca la usa. Si RABBITMQ_RETRY_DELAYS_MS
    // difiere entre el deploy de la API y el del worker, el segundo proceso
    // en arrancar choca con PRECONDITION_FAILED al redeclarar una queue con
    // un x-message-ttl distinto.
    it('no declara la queue principal ni los exchanges/queues de retry y DLQ', () => {
      const options = buildMessagingOptions(configFrom({}), 'producer');

      expect(options.queues).toEqual([]);
      expect(options.exchanges).toEqual([
        { name: JOBS_EXCHANGE, type: 'direct', options: { durable: true } },
      ]);
    });

    it('no declara defaultSubscribeErrorBehavior: la API nunca consume', () => {
      const options = buildMessagingOptions(configFrom({}), 'producer');

      expect(options.defaultSubscribeErrorBehavior).toBeUndefined();
    });

    it('sigue exponiendo uri, prefetch y publish options', () => {
      const options = buildMessagingOptions(configFrom({}), 'producer');

      expect(options.uri).toBe('amqp://smartplan:smartplan@localhost:5672');
      expect(options.defaultPublishOptions).toMatchObject({
        persistent: true,
      });
    });
  });

  describe('trampa de cache: true — ConfigService devuelve strings crudos', () => {
    it('coerciona un prefetch en string a número', () => {
      const configMock = {
        get: jest.fn((key: string) => {
          if (key === 'RABBITMQ_PREFETCH') return '2';
          return undefined;
        }),
      } as unknown as ConfigService<CommonEnvironmentVariables, true>;

      const options = buildMessagingOptions(configMock);

      expect(options.prefetchCount).toBe(2);
    });

    it('aplica el fallback cuando get devuelve undefined', () => {
      const configMock = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService<CommonEnvironmentVariables, true>;

      const { maxAttempts, retryDelaysMs } = readRetryParameters(configMock);

      expect(maxAttempts).toBe(3);
      expect(retryDelaysMs).toEqual([5000, 30000]);
    });
  });
});
