import { TipoTrabajo } from './tipo-trabajo';

/**
 * Envelope común de todos los trabajos publicados a la cola.
 *
 * `schemaVersion: 1` es literal-typed (no `number`) a propósito: agregar una
 * v2 obliga a tocar el tipo. Cuando el sobre cambie, los mensajes viejos que
 * queden en la DLQ siguen siendo interpretables gracias a este número.
 */
export interface SobreTrabajo<T = unknown> {
  schemaVersion: 1;
  /** UUID v4. Se loguea y más adelante correlaciona con la fila de
   *  PostgreSQL que sea fuente de verdad del trabajo. */
  id: string;
  /** Determina la routing key. */
  tipo: TipoTrabajo;
  /** ISO 8601. Cuándo se publicó, no cuándo se reintentó. */
  createdAt: string;
  /** Específico del tipo. Nunca se loguea entera: puede tener PII. */
  payload: T;
}
