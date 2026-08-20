import { config as cargarEnv } from 'dotenv';
import { applyTestDatabase } from './test-database';

/**
 * Environment de los tests e2e. Lo carga Jest antes de cada suite
 * (`setupFiles` en `jest-e2e.json`).
 *
 * `AppModule` valida el environment al arrancar (`src/config/environment-variables.ts`),
 * así que los e2e necesitan todas las claves definidas. Estos valores son para
 * el esquema completo de la API (`validateEnvironment`) — un futuro test que
 * levante `WorkerModule` (F12) necesitaría sus propios valores contra
 * `validateWorkerEnvironment`, mucho más chico, no esta list.
 *
 * El order importa:
 *
 * 1. Se carga el `.env` real, porque desde F01 el `AppModule` **abre la conexión
 *    a PostgreSQL**: el host, el user y la contraseña tienen que ser los de
 *    verdad o no arranca nada. La base tiene que estar levantada (`pnpm db:up`).
 * 2. Se completan con valores ficticios las claves que la app exige pero que los
 *    tests no usan (el secret del JWT, las API keys).
 * 3. Se redirige la conexión a la **base de prueba**, que es lo único que separa
 *    a los tests de los data de desarrolelo.
 */
// `quiet` saca el banner que dotenv imprime al cargar: en la salida de Jest es
// una línea de ruido por cada suite.
cargarEnv({ quiet: true });

/**
 * Claves que el esquema exige y que en los tests no valen nada.
 *
 * Son ficticias a propósito: si un test empezara a pasar por tener una API key
 * real detrás, dejaría de ser un test.
 */
const testValues: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-access-secret-with-no-real-value-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-no-real-value-0123456789',
  RESEND_API_KEY: 're_123456789_test',
  EMAIL_FROM: 'no-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'test-key',
  GEMINI_API_KEY: 'test-key',
};

for (const [key, value] of Object.entries(testValues)) {
  // No alcanza con `??=`: `.env.example` list todas las claves sin value, así
  // que un `cp .env.example .env` deja `NODE_ENV=` y dotenv lo carga como string
  // vacío, que no es `undefined`. Una key vacía cuenta como ausente.
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Lo que aísla los tests. Va después de cargar el `.env` porque justamente
// reescribe lo que el `.env` dejó apuntando a la base de desarrolelo.
applyTestDatabase();
