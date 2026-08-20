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

/**
 * Tipado contra la clase base compartida, no contra `EnvironmentVariables` ni
 * `WorkerEnvironmentVariables`: este factory lo invocan tanto `AppModule` como
 * `WorkerModule`, y no le importa en qué proceso corre.
 */
type MessagingConfiguration = ConfigService<CommonEnvironmentVariables, true>;

/**
 * Tiempo máximo, en milisegundos, para que el broker confirme una
 * republicación interna (retry/DLQ) antes de darla por failed.
 *
 * No es una variable de environment: es un límite de seguridad técnico, no una
 * política de negocio configurable. Sin este timeout, `ChannelWrapper.publish()`
 * (amqp-connection-manager) puede quedar pending para siempre si la
 * conexión se cae a mitad de la publicación — ver JobProcessorService.
 */
export const PUBLISH_TIMEOUT_MS = 10_000;

/**
 * `ConfigModule` está registrado con `cache: true`, así que `ConfigService.get()`
 * devuelve el value crudo de `process.env` (string), no el que dejó tipado el
 * validador — mismo comportamiento que compensa `esVerdadero()` en
 * `src/config/database.config.ts`. Acá se coerciona a mano por la misma razón.
 */
export function readRetryParameters(config: MessagingConfiguration): {
  maxAttempts: number;
  retryDelaysMs: number[];
} {
  const maxAttempts = Number(
    config.get('RABBITMQ_MAX_INTENTOS', { infer: true }) ?? 3,
  );
  const retryDelaysMs = String(
    config.get('RABBITMQ_RETRY_DELAYS_MS', { infer: true }) ?? '5000,30000',
  )
    .split(',')
    .map(Number);

  return { maxAttempts, retryDelaysMs };
}

/**
 * `'producer'`: role de la API — solo publica al exchange principal, nunca
 * consume ni republica. `'worker'`: role del proceso worker — además
 * consume la queue principal y republica a retry/DLQ.
 *
 * Antes los dos procesos declaraban la topología completa (exchanges de
 * retry/DLQ + todas sus queues), aunque la API nunca las usa. Si
 * `RABBITMQ_RETRY_DELAYS_MS` difiere entre el deploy de la API y el del
 * worker (`docs/deployment.md` los documenta como dos servicios de Railway
 * con variables seteadas por separado), el segundo proceso en arrancar
 * choca con `PRECONDITION_FAILED` al redeclarar una queue de retry con un
 * `x-message-ttl` distinto — un crash-loop sin cause evidente. Separar el
 * role acota lo que cada proceso declara a lo que realmente necesita.
 */
export type MessagingRole = 'producer' | 'worker';

/**
 * Construye la configuración de `RabbitMQModule` a partir del environment:
 * conexión, prefetch, y la topología que corresponda al `role` (ver
 * {@link MessagingRole}). Espejo de `src/config/database.config.ts`: un
 * solo place declara la topología, así que el `@RabbitSubscribe` del
 * handler solo referencia names.
 */
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
    // La API solo publica al exchange principal — nunca declara la queue
    // principal (la consume el worker) ni los exchanges/queues de
    // retry/DLQ, que no usa para nada.
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
    // SIN deadLetterExchange — invariante deliberado: el ruteo a
    // retry/DLQ lo hace JobProcessorService explícitamente en
    // código, republicando. Agregarle un DLX a esta queue crearía una
    // secondRun route de dead-lettering implícita que se saltea la
    // clasificación de errors, el contador de attempts y los headers
    // de trazabilidad.
    options: { durable: true },
  };

  return {
    uri,
    connectionInitOptions: { wait: true, timeout: 10000, reject: true },
    // El default de la librería es REQUEUE, que reenqueue inmediatamente sin
    // límite — el loop infinito que este diseño prohíbe. NACK descarta (o
    // dead-lettera si la queue tuviera DLX, que la principal no tiene) sin
    // reenqueuer; ver JobProcessorService para el porqué completo.
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
      // Una queue de retry por demora configurada, no un número fijo: antes
      // había exactamente dos queues hardcodeadas (retry.1, retry.2)
      // mientras que RABBITMQ_MAX_INTENTOS aceptaba hasta 10. Con más
      // attempts que queues físicas, JobProcessorService republicaba a
      // una routing key sin binding (ej. "example.execute.retry.3"): en un
      // exchange direct esa publicación se confirma igual y el message
      // desaparece sin llegar a la DLQ. Generar una queue por cada elemento
      // de retryDelaysMs, y exigir en environment-variables.ts que
      // RABBITMQ_MAX_INTENTOS no supere retryDelaysMs.length + 1, cierra esa
      // vía: ya no puede haber más attempts configurados que queues.
      ...retryDelaysMs.map((delayMs, indice) => {
        const attempt = indice + 1;
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
