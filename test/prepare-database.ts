import { config as loadEnvironment } from 'dotenv';
import { Client } from 'pg';
import {
  applyTestDatabase,
  MAINTENANCE_DATABASE,
  getConnectionData,
} from './test-database';

export default async function prepareDatabase(): Promise<void> {
  loadEnvironment({ quiet: true });

  const name = applyTestDatabase();
  const connection = getConnectionData();

  try {
    await createIfMissing(connection, name);
    await clearSchema(connection);
  } catch (error) {
    throw new Error(
      `The test database "${name}" could not be prepared at ` +
        `${connection.host}:${connection.port}.\n` +
        `Is it running? Try: pnpm db:up\n` +
        `Cause: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log(`\n  Test database ready: ${name}\n`);
}

async function createIfMissing(
  connection: ReturnType<typeof getConnectionData>,
  name: string,
): Promise<void> {
  const client = new Client({ ...connection, database: MAINTENANCE_DATABASE });
  await client.connect();

  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );

    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}

async function clearSchema(
  connection: ReturnType<typeof getConnectionData>,
): Promise<void> {
  const client = new Client(connection);
  await client.connect();

  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}
