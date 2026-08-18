import { ConsumeMessage } from 'amqplib';

/** Exchange principal: toda publicación de negocio entra por acá. */
export const EXCHANGE_TRABAJOS = 'smartplan.jobs';
/** Exchange intermedio: solo lo usan las republicaciones a colas de retry. */
export const EXCHANGE_REINTENTOS = 'smartplan.jobs.retry';
/** Exchange final: solo lo usan las republicaciones a la DLQ. */
export const EXCHANGE_FALLIDOS = 'smartplan.jobs.dlx';

export const COLA_EJEMPLO = 'smartplan.jobs.example';
export const RK_EJEMPLO = 'example.execute';

/**
 * Única fuente de verdad para los nombres de cola y routing key de retry/DLQ
 * de un tipo de trabajo. Tanto `mensajeria.config.ts` (que declara las colas)
 * como `ProcesadorTrabajosService` (que publica hacia ellas) llaman a estas
 * mismas funciones — antes cada lado rearmaba el nombre por su cuenta
 * (interpolación de string en el procesador vs. constantes en la config), y
 * las dos representaciones podían divergir sin que nada lo detectara: en un
 * exchange `direct` una publicación a una routing key sin binding se
 * confirma igual y el mensaje se pierde en silencio.
 *
 * `colaPrincipal` es el nombre completo de la cola (`smartplan.jobs.example`),
 * no la routing key: son cadenas independientes hoy (`RK_EJEMPLO` no
 * contiene `example` en la misma posición) y no hay ninguna regla que
 * permita derivar una de la otra.
 *
 * `intento` es 1-based, igual que `MetadatosTrabajo.intento`: el reintento
 * que corresponde al primer fallo es la cola de retry número 1.
 */
export function colaReintento(colaPrincipal: string, intento: number): string {
  return `${colaPrincipal}.retry.${intento}`;
}

export function routingKeyReintento(
  routingKeyPrincipal: string,
  intento: number,
): string {
  return `${routingKeyPrincipal}.retry.${intento}`;
}

export function colaFallidos(colaPrincipal: string): string {
  return `${colaPrincipal}.dlq`;
}

export function routingKeyFallidos(routingKeyPrincipal: string): string {
  return `${routingKeyPrincipal}.dlq`;
}

export const COLA_EJEMPLO_FALLIDOS = colaFallidos(COLA_EJEMPLO);
export const RK_EJEMPLO_FALLIDOS = routingKeyFallidos(RK_EJEMPLO);

/** Número de intento (1-based). Se incrementa en cada republicación. */
export const HEADER_INTENTO = 'x-smartplan-intento';
/** Duplica `sobre.tipo` para poder filtrar/loguear sin deserializar el body. */
export const HEADER_TIPO = 'x-smartplan-tipo';
/** Solo presente en mensajes que llegaron a la DLQ. Mensaje truncado, no el stack. */
export const HEADER_ERROR = 'x-smartplan-error';
/** Solo presente en mensajes que llegaron a la DLQ. `error.constructor.name`. */
export const HEADER_ERROR_CLASE = 'x-smartplan-error-clase';

export interface MetadatosTrabajo {
  id: string;
  tipo: string;
  intento: number;
  correlationId?: string;
}

/**
 * Extrae los metadatos de transporte de un mensaje AMQP, tipados.
 *
 * Existe para no regar `headers['x-...']` de tipo `any` por todo el código
 * del worker — cada lectura suelta dispara `no-unsafe-argument` (`warn` en
 * el lint de este repo).
 */
export function leerMetadatos(amqpMsg: ConsumeMessage): MetadatosTrabajo {
  // `?? {}`: un mensaje publicado a mano desde el panel de RabbitMQ (sin
  // agregar ninguna "Header") deja `properties.headers` en `undefined`, no
  // en `{}` — sin este fallback, `headers[HEADER_INTENTO]` tira un
  // `TypeError` que antes escapaba del `try` de `procesar()` y perdía el
  // mensaje sin pasar por la DLQ (bloqueante de code review).
  const headers = (amqpMsg.properties.headers ?? {}) as Record<string, unknown>;

  // Default 1 es defensivo: un mensaje publicado a mano desde el panel de
  // RabbitMQ no necesariamente trae el header.
  const intentoCrudo = headers[HEADER_INTENTO];
  const intento =
    typeof intentoCrudo === 'number' ? intentoCrudo : Number(intentoCrudo) || 1;

  const tipoCrudo = headers[HEADER_TIPO];
  const tipo =
    typeof tipoCrudo === 'string' ? tipoCrudo : amqpMsg.fields.routingKey;

  return {
    id: amqpMsg.properties.messageId as string,
    tipo,
    intento,
    correlationId: amqpMsg.properties.correlationId as string | undefined,
  };
}
