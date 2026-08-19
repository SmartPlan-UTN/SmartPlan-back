import { config as cargarEnv } from 'dotenv';
import { aplicarBaseDeDatosDePrueba } from './base-de-datos-de-prueba';

/**
 * Entorno de los tests e2e. Lo carga Jest antes de cada suite
 * (`setupFiles` en `jest-e2e.json`).
 *
 * `AppModule` valida el entorno al arrancar (`src/config/variables-entorno.ts`),
 * así que los e2e necesitan todas las claves definidas. Estos valores son para
 * el esquema completo de la API (`validarEntorno`) — un futuro test que
 * levante `WorkerModule` (F12) necesitaría sus propios valores contra
 * `validarEntornoWorker`, mucho más chico, no esta lista.
 *
 * El orden importa:
 *
 * 1. Se carga el `.env` real, porque desde F01 el `AppModule` **abre la conexión
 *    a PostgreSQL**: el host, el usuario y la contraseña tienen que ser los de
 *    verdad o no arranca nada. La base tiene que estar levantada (`pnpm db:up`).
 * 2. Se completan con valores ficticios las claves que la app exige pero que los
 *    tests no usan (el secreto del JWT, las API keys).
 * 3. Se redirige la conexión a la **base de prueba**, que es lo único que separa
 *    a los tests de los datos de desarrollo.
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
const valoresDePrueba: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'access-de-prueba-sin-valor-real-0123456789',
  JWT_REFRESH_SECRET: 'refresh-de-prueba-sin-valor-real-0123456789',
  RESEND_API_KEY: 're_123456789_prueba',
  EMAIL_FROM: 'no-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'clave-de-prueba',
  GEMINI_API_KEY: 'clave-de-prueba',
};

for (const [clave, valor] of Object.entries(valoresDePrueba)) {
  // No alcanza con `??=`: `.env.example` lista todas las claves sin valor, así
  // que un `cp .env.example .env` deja `NODE_ENV=` y dotenv lo carga como string
  // vacío, que no es `undefined`. Una clave vacía cuenta como ausente.
  if (!process.env[clave]) {
    process.env[clave] = valor;
  }
}

// Lo que aísla los tests. Va después de cargar el `.env` porque justamente
// reescribe lo que el `.env` dejó apuntando a la base de desarrollo.
aplicarBaseDeDatosDePrueba();
