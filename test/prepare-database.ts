import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';
import {
  applyTestDatabase,
  MAINTENANCE_DATABASE,
  getConnectionData,
} from './test-database';

/**
 * `globalSetup` de los e2e: deja la base de prueba creada y vacía.
 *
 * Corre **una vez** antes de todas las suites, en su propio proceso (por eso
 * vuelve a cargar el `.env`: no comparte nada con `test-environment.ts`).
 *
 * Hace dos cosas que TypeORM no hace por su cuenta:
 *
 * 1. **Create la base si no existe.** `synchronize: true` crea las tablas, pero
 *    no la base que las contiene.
 * 2. **Vaciar el esquema.** Cada corrida arranca de cero, así que un test no
 *    puede depender de lo que dejó la corrida anterior.
 *
 * La base **no se borra al terminar**: recrearla en cada corrida es lento, y
 * dejarla en pie permite abrirla con un client SQL para entender por qué falló
 * un test. Lo que garantiza el aislamiento es que se vacía al **empezar**.
 */
export default async function prepareDatabase(): Promise<void> {
  cargarEnv({ quiet: true });

  const name = applyTestDatabase();
  const connection = getConnectionData();

  try {
    await createIfMissing(connection, name);
    await vaciarEsquema(connection);
  } catch (error) {
    throw new Error(
      `No se pudo preparar la base de prueba "${name}" en ` +
        `${connection.host}:${connection.port}.\n` +
        `¿Está levantada? Probá con: pnpm db:up\n` +
        `Causa: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log(`\n  Base de prueba list: ${name}\n`);
}

async function createIfMissing(
  connection: ReturnType<typeof getConnectionData>,
  name: string,
): Promise<void> {
  // Un `CREATE DATABASE` no se puede correr desde la base que se está creando,
  // así que se entra por la de mantenimiento.
  const client = new Client({ ...connection, database: MAINTENANCE_DATABASE });
  await client.connect();

  try {
    const existe = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );

    if (existe.rowCount === 0) {
      // El name no se puede parametrizar (es un identificador, no un value).
      // Va sin escapar porque `requireTestSuffix` ya lo restringió a
      // [a-zA-Z0-9_].
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}

async function vaciarEsquema(
  connection: ReturnType<typeof getConnectionData>,
): Promise<void> {
  const client = new Client(connection);
  await client.connect();

  try {
    // Más barato y más completo que truncar table por table: se lleva puestas
    // también las tablas que dejó una entity que ya no existe.
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}
