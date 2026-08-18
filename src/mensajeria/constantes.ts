import { ConsumeMessage } from 'amqplib';

/** Exchange principal: toda publicación de negocio entra por acá. */
export const EXCHANGE_TRABAJOS = 'smartplan.jobs';
/** Exchange intermedio: solo lo usan las republicaciones a colas de retry. */
export const EXCHANGE_REINTENTOS = 'smartplan.jobs.retry';
/** Exchange final: solo lo usan las republicaciones a la DLQ. */
export const EXCHANGE_FALLIDOS = 'smartplan.jobs.dlx';

export const COLA_EJEMPLO = 'smartplan.jobs.example';
export const COLA_EJEMPLO_REINTENTO_1 = 'smartplan.jobs.example.retry.1';
export const COLA_EJEMPLO_REINTENTO_2 = 'smartplan.jobs.example.retry.2';
export const COLA_EJEMPLO_FALLIDOS = 'smartplan.jobs.example.dlq';

export const RK_EJEMPLO = 'example.execute';
export const RK_EJEMPLO_REINTENTO_1 = 'example.execute.retry.1';
export const RK_EJEMPLO_REINTENTO_2 = 'example.execute.retry.2';
export const RK_EJEMPLO_FALLIDOS = 'example.execute.dlq';

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
  const headers = amqpMsg.properties.headers as Record<string, unknown>;

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
