import { ConfigService } from '@nestjs/config';
import {
  MessageHandlerErrorBehavior,
  RabbitMQConfig,
} from '@golevelup/nestjs-rabbitmq';
import { VariablesEntornoComunes } from '../config/variables-entorno';
import {
  COLA_EJEMPLO,
  COLA_EJEMPLO_FALLIDOS,
  colaReintento,
  EXCHANGE_FALLIDOS,
  EXCHANGE_REINTENTOS,
  EXCHANGE_TRABAJOS,
  RK_EJEMPLO,
  RK_EJEMPLO_FALLIDOS,
  routingKeyReintento,
} from './constantes';

/**
 * Tipado contra la clase base compartida, no contra `VariablesEntorno` ni
 * `VariablesEntornoWorker`: este factory lo invocan tanto `AppModule` como
 * `WorkerModule`, y no le importa en qué proceso corre.
 */
type ConfiguracionDeMensajeria = ConfigService<VariablesEntornoComunes, true>;

/**
 * Tiempo máximo, en milisegundos, para que el broker confirme una
 * republicación interna (retry/DLQ) antes de darla por fallida.
 *
 * No es una variable de entorno: es un límite de seguridad técnico, no una
 * política de negocio configurable. Sin este timeout, `ChannelWrapper.publish()`
 * (amqp-connection-manager) puede quedar pendiente para siempre si la
 * conexión se cae a mitad de la publicación — ver ProcesadorTrabajosService.
 */
export const TIMEOUT_PUBLICACION_MS = 10_000;

/**
 * `ConfigModule` está registrado con `cache: true`, así que `ConfigService.get()`
 * devuelve el valor crudo de `process.env` (string), no el que dejó tipado el
 * validador — mismo comportamiento que compensa `esVerdadero()` en
 * `src/config/database.config.ts`. Acá se coerciona a mano por la misma razón.
 */
export function leerParametrosDeReintento(config: ConfiguracionDeMensajeria): {
  maxIntentos: number;
  demorasMs: number[];
} {
  const maxIntentos = Number(
    config.get('RABBITMQ_MAX_INTENTOS', { infer: true }) ?? 3,
  );
  const demorasMs = String(
    config.get('RABBITMQ_RETRY_DELAYS_MS', { infer: true }) ?? '5000,30000',
  )
    .split(',')
    .map(Number);

  return { maxIntentos, demorasMs };
}

/**
 * `'productor'`: rol de la API — solo publica al exchange principal, nunca
 * consume ni republica. `'worker'`: rol del proceso worker — además
 * consume la cola principal y republica a retry/DLQ.
 *
 * Antes los dos procesos declaraban la topología completa (exchanges de
 * retry/DLQ + todas sus colas), aunque la API nunca las usa. Si
 * `RABBITMQ_RETRY_DELAYS_MS` difiere entre el deploy de la API y el del
 * worker (`docs/despliegue.md` los documenta como dos servicios de Railway
 * con variables seteadas por separado), el segundo proceso en arrancar
 * choca con `PRECONDITION_FAILED` al redeclarar una cola de retry con un
 * `x-message-ttl` distinto — un crash-loop sin causa evidente. Separar el
 * rol acota lo que cada proceso declara a lo que realmente necesita.
 */
export type RolDeMensajeria = 'productor' | 'worker';

/**
 * Construye la configuración de `RabbitMQModule` a partir del entorno:
 * conexión, prefetch, y la topología que corresponda al `rol` (ver
 * {@link RolDeMensajeria}). Espejo de `src/config/database.config.ts`: un
 * solo lugar declara la topología, así que el `@RabbitSubscribe` del
 * manejador solo referencia nombres.
 */
export function construirOpcionesDeMensajeria(
  config: ConfiguracionDeMensajeria,
  rol: RolDeMensajeria = 'worker',
): RabbitMQConfig {
  const uri =
    config.get('RABBITMQ_URL', { infer: true }) ??
    'amqp://smartplan:smartplan@localhost:5672';
  const prefetchCount = Number(
    config.get('RABBITMQ_PREFETCH', { infer: true }) ?? 1,
  );

  if (rol === 'productor') {
    // La API solo publica al exchange principal — nunca declara la cola
    // principal (la consume el worker) ni los exchanges/colas de
    // retry/DLQ, que no usa para nada.
    return {
      uri,
      connectionInitOptions: { wait: true, timeout: 10000, reject: true },
      defaultPublishOptions: { persistent: true },
      prefetchCount,
      exchanges: [
        {
          name: EXCHANGE_TRABAJOS,
          type: 'direct',
          options: { durable: true },
        },
      ],
      queues: [],
    };
  }

  const { demorasMs } = leerParametrosDeReintento(config);

  const colaPrincipal = {
    name: COLA_EJEMPLO,
    exchange: EXCHANGE_TRABAJOS,
    routingKey: RK_EJEMPLO,
    createQueueIfNotExists: true,
    // SIN deadLetterExchange — invariante deliberado: el ruteo a
    // retry/DLQ lo hace ProcesadorTrabajosService explícitamente en
    // código, republicando. Agregarle un DLX a esta cola crearía una
    // segunda ruta de dead-lettering implícita que se saltea la
    // clasificación de errores, el contador de intentos y los headers
    // de trazabilidad.
    options: { durable: true },
  };

  return {
    uri,
    connectionInitOptions: { wait: true, timeout: 10000, reject: true },
    // El default de la librería es REQUEUE, que reencola inmediatamente sin
    // límite — el loop infinito que este diseño prohíbe. NACK descarta (o
    // dead-lettera si la cola tuviera DLX, que la principal no tiene) sin
    // reencolar; ver ProcesadorTrabajosService para el porqué completo.
    defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK,
    defaultPublishOptions: { persistent: true },
    prefetchCount,
    exchanges: [
      { name: EXCHANGE_TRABAJOS, type: 'direct', options: { durable: true } },
      {
        name: EXCHANGE_REINTENTOS,
        type: 'direct',
        options: { durable: true },
      },
      { name: EXCHANGE_FALLIDOS, type: 'direct', options: { durable: true } },
    ],
    queues: [
      colaPrincipal,
      // Una cola de retry por demora configurada, no un número fijo: antes
      // había exactamente dos colas hardcodeadas (retry.1, retry.2)
      // mientras que RABBITMQ_MAX_INTENTOS aceptaba hasta 10. Con más
      // intentos que colas físicas, ProcesadorTrabajosService republicaba a
      // una routing key sin binding (ej. "example.execute.retry.3"): en un
      // exchange direct esa publicación se confirma igual y el mensaje
      // desaparece sin llegar a la DLQ. Generar una cola por cada elemento
      // de demorasMs, y exigir en variables-entorno.ts que
      // RABBITMQ_MAX_INTENTOS no supere demorasMs.length + 1, cierra esa
      // vía: ya no puede haber más intentos configurados que colas.
      ...demorasMs.map((demoraMs, indice) => {
        const intento = indice + 1;
        return {
          name: colaReintento(COLA_EJEMPLO, intento),
          exchange: EXCHANGE_REINTENTOS,
          routingKey: routingKeyReintento(RK_EJEMPLO, intento),
          createQueueIfNotExists: true,
          options: {
            durable: true,
            messageTtl: demoraMs,
            deadLetterExchange: EXCHANGE_TRABAJOS,
            deadLetterRoutingKey: RK_EJEMPLO,
          },
        };
      }),
      {
        name: COLA_EJEMPLO_FALLIDOS,
        exchange: EXCHANGE_FALLIDOS,
        routingKey: RK_EJEMPLO_FALLIDOS,
        createQueueIfNotExists: true,
        options: { durable: true },
      },
    ],
  };
}
