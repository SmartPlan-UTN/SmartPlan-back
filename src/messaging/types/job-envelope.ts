import { JobType } from './job-type';

/**
 * Envelope común de todos los jobs publicados a la queue.
 *
 * `schemaVersion: 1` es literal-typed (no `number`) a propósito: agregar una
 * v2 obliga a tocar el type. Cuando el envelope cambie, los messages viejos que
 * queden en la DLQ siguen siendo interpretables gracias a este número.
 */
export interface JobEnvelope<T = unknown> {
  schemaVersion: 1;
  /** UUID v4. Se loguea y más adelante correlaciona con la fila de
   *  PostgreSQL que sea dataSource de verdad del job. */
  id: string;
  /** Determina la routing key. */
  type: JobType;
  /** ISO 8601. Cuándo se publicó, no cuándo se reintentó. */
  createdAt: string;
  /** Específico del type. Nunca se loguea entera: puede tener PII. */
  payload: T;
}
