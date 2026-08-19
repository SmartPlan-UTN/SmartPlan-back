import {
  VariablesEntornoComunes,
  validarContra,
  validarCoherenciaDeReintentos,
} from './variables-entorno';

/**
 * Esquema de entorno del proceso worker (F12).
 *
 * Es un subconjunto deliberado de {@link VariablesEntornoComunes}: el worker
 * de este ticket no usa los secretos JWT, ni las API keys, ni la conexión a
 * PostgreSQL, así que no los exige. Cuando un ticket futuro le agregue al
 * worker acceso a Postgres/Google Maps/Gemini, esas claves se suman acá —
 * hoy la clase queda vacía a propósito: es la declaración honesta de "el
 * worker no necesita nada más que el núcleo común, todavía".
 */
export class VariablesEntornoWorker extends VariablesEntornoComunes {}

/**
 * Valida `process.env` contra {@link VariablesEntornoWorker} al arrancar el
 * worker. La usa `ConfigModule.forRoot({ validate: validarEntornoWorker })`
 * en `WorkerModule`, un registro separado del que usa `AppModule` con
 * `validarEntorno` — son dos procesos Node distintos, cada uno valida el
 * subconjunto del `.env` que realmente necesita.
 */
export function validarEntornoWorker(
  configuracion: Record<string, unknown>,
): VariablesEntornoWorker {
  const variables = validarContra(VariablesEntornoWorker, configuracion);
  validarCoherenciaDeReintentos(variables);
  return variables;
}
