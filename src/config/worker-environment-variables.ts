import {
  CommonEnvironmentVariables,
  validateAgainst,
  validateRetryConsistency,
} from './environment-variables';

/**
 * Esquema de environment del proceso worker (F12).
 *
 * Es un subconjunto deliberado de {@link CommonEnvironmentVariables}: el worker
 * de este ticket no usa `JWT_SECRET`, ni las API keys, ni la conexión a
 * PostgreSQL, así que no los exige. Cuando un ticket futuro le agregue al
 * worker acceso a Postgres/Google Maps/Gemini, esas claves se suman acá —
 * hoy la clase queda vacía a propósito: es la declaración honesta de "el
 * worker no necesita nada más que el núcleo común, todavía".
 */
export class WorkerEnvironmentVariables extends CommonEnvironmentVariables {}

/**
 * Valida `process.env` contra {@link WorkerEnvironmentVariables} al arrancar el
 * worker. La usa `ConfigModule.forRoot({ validate: validateWorkerEnvironment })`
 * en `WorkerModule`, un signup separado del que usa `AppModule` con
 * `validateEnvironment` — son dos procesos Node distintos, cada uno valida el
 * subconjunto del `.env` que realmente necesita.
 */
export function validateWorkerEnvironment(
  configuration: Record<string, unknown>,
): WorkerEnvironmentVariables {
  const variables = validateAgainst(WorkerEnvironmentVariables, configuration);
  validateRetryConsistency(variables);
  return variables;
}
