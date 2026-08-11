/**
 * Variables de entorno para los tests e2e.
 *
 * `AppModule` valida el entorno al arrancar (ver `src/config/variables-entorno.ts`),
 * así que los e2e necesitan las claves definidas. Estos son valores ficticios,
 * suficientes para pasar el esquema; no sirven para conectarse a nada.
 *
 * Solo completa las que falten: si ya hay un `.env` o variables reales exportadas
 * en la shell, ganan esas.
 */
const valoresDePrueba: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL:
    'postgresql://smartplan:smartplan@localhost:5432/smartplan_test',
  JWT_SECRET: 'secreto-de-prueba-sin-valor-real-0123456789',
  GOOGLE_MAPS_API_KEY: 'clave-de-prueba',
  OPENAI_API_KEY: 'clave-de-prueba',
};

for (const [clave, valor] of Object.entries(valoresDePrueba)) {
  process.env[clave] ??= valor;
}
