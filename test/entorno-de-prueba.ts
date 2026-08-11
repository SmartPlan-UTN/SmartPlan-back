import { config as cargarEnv } from 'dotenv';

/**
 * Variables de entorno para los tests e2e.
 *
 * `AppModule` valida el entorno al arrancar (ver `src/config/variables-entorno.ts`),
 * así que los e2e necesitan las claves definidas. Los valores de abajo son
 * ficticios, suficientes para pasar el esquema.
 *
 * Solo completan las que falten: si ya hay variables exportadas en la shell,
 * ganan esas.
 *
 * El `.env` se carga primero porque desde F01 el `AppModule` **abre la conexión
 * a PostgreSQL**: la configuración de la base tiene que ser la real, no una
 * ficticia, o los e2e no arrancan. La base tiene que estar levantada
 * (`pnpm db:up`).
 */
cargarEnv();

const valoresDePrueba: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  JWT_SECRET: 'secreto-de-prueba-sin-valor-real-0123456789',
  GOOGLE_MAPS_API_KEY: 'clave-de-prueba',
  OPENAI_API_KEY: 'clave-de-prueba',
};

for (const [clave, valor] of Object.entries(valoresDePrueba)) {
  process.env[clave] ??= valor;
}
