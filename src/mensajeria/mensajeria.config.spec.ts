import { ConfigService } from '@nestjs/config';
import { MessageHandlerErrorBehavior } from '@golevelup/nestjs-rabbitmq';
import {
  construirOpcionesDeMensajeria,
  leerParametrosDeReintento,
} from './mensajeria.config';
import {
  COLA_EJEMPLO,
  COLA_EJEMPLO_FALLIDOS,
  colaReintento,
  EXCHANGE_FALLIDOS,
  EXCHANGE_REINTENTOS,
  EXCHANGE_TRABAJOS,
} from './constantes';
import {
  validarContra,
  VariablesEntornoComunes,
} from '../config/variables-entorno';

/** Pasa el entorno por la misma validación que corre al arrancar la app. */
function configDesde(
  entorno: Record<string, string>,
): ConfigService<VariablesEntornoComunes, true> {
  return new ConfigService<VariablesEntornoComunes, true>(
    validarContra(VariablesEntornoComunes, entorno),
  );
}

describe('construirOpcionesDeMensajeria', () => {
  it('declara los tres exchanges direct y durables', () => {
    const opciones = construirOpcionesDeMensajeria(configDesde({}));

    expect(opciones.exchanges).toEqual(
      expect.arrayContaining([
        { name: EXCHANGE_TRABAJOS, type: 'direct', options: { durable: true } },
        {
          name: EXCHANGE_REINTENTOS,
          type: 'direct',
          options: { durable: true },
        },
        { name: EXCHANGE_FALLIDOS, type: 'direct', options: { durable: true } },
      ]),
    );
  });

  it('declara la cola principal atada al exchange de trabajos, sin dead letter exchange', () => {
    const opciones = construirOpcionesDeMensajeria(configDesde({}));
    const colaPrincipal = opciones.queues?.find((q) => q.name === COLA_EJEMPLO);

    expect(colaPrincipal).toMatchObject({
      exchange: EXCHANGE_TRABAJOS,
      routingKey: 'example.execute',
    });
    expect(colaPrincipal?.options?.deadLetterExchange).toBeUndefined();
  });

  it('declara las colas de retry con TTL y dead letter exchange de vuelta a la principal', () => {
    const opciones = construirOpcionesDeMensajeria(
      configDesde({ RABBITMQ_RETRY_DELAYS_MS: '5000,30000' }),
    );

    const retry1 = opciones.queues?.find(
      (q) => q.name === colaReintento(COLA_EJEMPLO, 1),
    );
    const retry2 = opciones.queues?.find(
      (q) => q.name === colaReintento(COLA_EJEMPLO, 2),
    );

    expect(retry1?.options).toMatchObject({
      messageTtl: 5000,
      deadLetterExchange: EXCHANGE_TRABAJOS,
      deadLetterRoutingKey: 'example.execute',
    });
    expect(retry2?.options).toMatchObject({
      messageTtl: 30000,
      deadLetterExchange: EXCHANGE_TRABAJOS,
      deadLetterRoutingKey: 'example.execute',
    });
  });

  it('declara exactamente una cola de retry por demora configurada', () => {
    const opciones = construirOpcionesDeMensajeria(
      configDesde({
        RABBITMQ_MAX_INTENTOS: '4',
        RABBITMQ_RETRY_DELAYS_MS: '5000,30000,60000',
      }),
    );

    const colasDeRetry = opciones.queues?.filter((q) =>
      q.name.includes('.retry.'),
    );

    expect(colasDeRetry).toHaveLength(3);
    expect(colasDeRetry?.map((q) => q.name)).toEqual([
      colaReintento(COLA_EJEMPLO, 1),
      colaReintento(COLA_EJEMPLO, 2),
      colaReintento(COLA_EJEMPLO, 3),
    ]);
  });

  it('declara la cola de fallidos sin TTL ni dead letter exchange', () => {
    const opciones = construirOpcionesDeMensajeria(configDesde({}));
    const dlq = opciones.queues?.find((q) => q.name === COLA_EJEMPLO_FALLIDOS);

    expect(dlq).toMatchObject({
      exchange: EXCHANGE_FALLIDOS,
      routingKey: 'example.execute.dlq',
    });
    expect(dlq?.options?.messageTtl).toBeUndefined();
    expect(dlq?.options?.deadLetterExchange).toBeUndefined();
  });

  it('aplica los valores por defecto cuando el entorno no define nada', () => {
    const opciones = construirOpcionesDeMensajeria(configDesde({}));

    expect(opciones.prefetchCount).toBe(1);
    expect(opciones.uri).toBe('amqp://smartplan:smartplan@localhost:5672');
  });

  it('convierte los valores del entorno de string a número', () => {
    const opciones = construirOpcionesDeMensajeria(
      configDesde({ RABBITMQ_PREFETCH: '5' }),
    );

    expect(opciones.prefetchCount).toBe(5);
    expect(typeof opciones.prefetchCount).toBe('number');
  });

  it('usa NACK como comportamiento por defecto ante error del handler', () => {
    // Protege contra el bug de ACK incondicional (perdía el mensaje si
    // fallaba la republicación) y contra el loop infinito de REQUEUE.
    const opciones = construirOpcionesDeMensajeria(configDesde({}));

    expect(opciones.defaultSubscribeErrorBehavior).toBe(
      MessageHandlerErrorBehavior.NACK,
    );
  });

  it('marca los mensajes como persistentes por defecto', () => {
    const opciones = construirOpcionesDeMensajeria(configDesde({}));

    expect(opciones.defaultPublishOptions).toMatchObject({ persistent: true });
  });

  describe('rol "productor" (API)', () => {
    // Regresión de code review: antes la API declaraba la topología
    // completa (retry/DLQ) aunque nunca la usa. Si RABBITMQ_RETRY_DELAYS_MS
    // difiere entre el deploy de la API y el del worker, el segundo proceso
    // en arrancar choca con PRECONDITION_FAILED al redeclarar una cola con
    // un x-message-ttl distinto.
    it('no declara la cola principal ni los exchanges/colas de retry y DLQ', () => {
      const opciones = construirOpcionesDeMensajeria(
        configDesde({}),
        'productor',
      );

      expect(opciones.queues).toEqual([]);
      expect(opciones.exchanges).toEqual([
        { name: EXCHANGE_TRABAJOS, type: 'direct', options: { durable: true } },
      ]);
    });

    it('no declara defaultSubscribeErrorBehavior: la API nunca consume', () => {
      const opciones = construirOpcionesDeMensajeria(
        configDesde({}),
        'productor',
      );

      expect(opciones.defaultSubscribeErrorBehavior).toBeUndefined();
    });

    it('sigue exponiendo uri, prefetch y publish options', () => {
      const opciones = construirOpcionesDeMensajeria(
        configDesde({}),
        'productor',
      );

      expect(opciones.uri).toBe('amqp://smartplan:smartplan@localhost:5672');
      expect(opciones.defaultPublishOptions).toMatchObject({
        persistent: true,
      });
    });
  });

  describe('trampa de cache: true — ConfigService devuelve strings crudos', () => {
    it('coerciona un prefetch en string a número', () => {
      const configMock = {
        get: jest.fn((clave: string) => {
          if (clave === 'RABBITMQ_PREFETCH') return '2';
          return undefined;
        }),
      } as unknown as ConfigService<VariablesEntornoComunes, true>;

      const opciones = construirOpcionesDeMensajeria(configMock);

      expect(opciones.prefetchCount).toBe(2);
    });

    it('aplica el fallback cuando get devuelve undefined', () => {
      const configMock = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService<VariablesEntornoComunes, true>;

      const { maxIntentos, demorasMs } = leerParametrosDeReintento(configMock);

      expect(maxIntentos).toBe(3);
      expect(demorasMs).toEqual([5000, 30000]);
    });
  });
});
