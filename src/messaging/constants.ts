import { ConsumeMessage } from 'amqplib';

/** Exchange principal: toda publicación de negocio entra por acá. */
export const JOBS_EXCHANGE = 'smartplan.jobs';
/** Exchange intermedio: solo lo usan las republicaciones a queues de retry. */
export const RETRY_EXCHANGE = 'smartplan.jobs.retry';
/** Exchange final: solo lo usan las republicaciones a la DLQ. */
export const FAILED_EXCHANGE = 'smartplan.jobs.dlx';

export const EXAMPLE_QUEUE = 'smartplan.jobs.example';
export const EXAMPLE_ROUTING_KEY = 'example.execute';

/**
 * Única dataSource de verdad para los names de queue y routing key de retry/DLQ
 * de un type de job. Tanto `messaging.config.ts` (que declara las queues)
 * como `JobProcessorService` (que publica hacia ellas) llaman a estas
 * mismas funciones — antes cada lado rearmaba el name por su cuenta
 * (interpolación de string en el processor vs. constantes en la config), y
 * las dos representaciones podían divergir sin que nada lo detectara: en un
 * exchange `direct` una publicación a una routing key sin binding se
 * confirma igual y el message se pierde en silencio.
 *
 * `primaryQueue` es el name completo de la queue (`smartplan.jobs.example`),
 * no la routing key: son cadenas independientes hoy (`EXAMPLE_ROUTING_KEY` no
 * contiene `example` en la misma posición) y no hay ninguna regla que
 * permita derivar una de la otra.
 *
 * `attempt` es 1-based, igual que `JobMetadata.attempt`: el reattempt
 * que corresponde al primer fallo es la queue de retry número 1.
 */
export function retryQueue(primaryQueue: string, attempt: number): string {
  return `${primaryQueue}.retry.${attempt}`;
}

export function retryRoutingKey(
  primaryRoutingKey: string,
  attempt: number,
): string {
  return `${primaryRoutingKey}.retry.${attempt}`;
}

export function failedQueue(primaryQueue: string): string {
  return `${primaryQueue}.dlq`;
}

export function failedRoutingKey(primaryRoutingKey: string): string {
  return `${primaryRoutingKey}.dlq`;
}

export const FAILED_EXAMPLE_QUEUE = failedQueue(EXAMPLE_QUEUE);
export const FAILED_EXAMPLE_ROUTING_KEY = failedRoutingKey(EXAMPLE_ROUTING_KEY);

/** Número de attempt (1-based). Se incrementa en cada republicación. */
export const ATTEMPT_HEADER = 'x-smartplan-attempt';
/** Duplica `envelope.type` para poder filtrar/loguear sin deserializar el body. */
export const TYPE_HEADER = 'x-smartplan-type';
/** Solo presente en messages que llegaron a la DLQ. Message truncado, no el stack. */
export const ERROR_HEADER = 'x-smartplan-error';
/** Solo presente en messages que llegaron a la DLQ. `error.constructor.name`. */
export const ERROR_CLASS_HEADER = 'x-smartplan-error-clase';

export interface JobMetadata {
  id: string;
  type: string;
  attempt: number;
  correlationId?: string;
}

/**
 * Extrae los metadata de transporte de un message AMQP, tipados.
 *
 * Existe para no regar `headers['x-...']` de type `any` por todo el código
 * del worker — cada lectura suelta dispara `no-unsafe-argument` (`warn` en
 * el lint de este repo).
 */
export function readMetadata(amqpMsg: ConsumeMessage): JobMetadata {
  // `?? {}`: un message publicado a mano desde el panel de RabbitMQ (sin
  // agregar ninguna "Header") deja `properties.headers` en `undefined`, no
  // en `{}` — sin este fallback, `headers[ATTEMPT_HEADER]` tira un
  // `TypeError` que antes escapaba del `try` de `process()` y perdía el
  // message sin pasar por la DLQ (bloqueante de code review).
  const headers = (amqpMsg.properties.headers ?? {}) as Record<string, unknown>;

  // Default 1 es defensivo: un message publicado a mano desde el panel de
  // RabbitMQ no necesariamente trae el header.
  const rawAttempt = headers[ATTEMPT_HEADER];
  const attempt =
    typeof rawAttempt === 'number' ? rawAttempt : Number(rawAttempt) || 1;

  const rawType = headers[TYPE_HEADER];
  const type =
    typeof rawType === 'string' ? rawType : amqpMsg.fields.routingKey;

  return {
    id: amqpMsg.properties.messageId as string,
    type,
    attempt,
    correlationId: amqpMsg.properties.correlationId as string | undefined,
  };
}
