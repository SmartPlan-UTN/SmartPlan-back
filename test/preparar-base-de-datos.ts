import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';
import {
  aplicarBaseDeDatosDePrueba,
  BASE_DE_MANTENIMIENTO,
  datosDeConexion,
} from './base-de-datos-de-prueba';

/**
 * `globalSetup` de los e2e: deja la base de prueba creada y vacía.
 *
 * Corre **una vez** antes de todas las suites, en su propio proceso (por eso
 * vuelve a cargar el `.env`: no comparte nada con `entorno-de-prueba.ts`).
 *
 * Hace dos cosas que TypeORM no hace por su cuenta:
 *
 * 1. **Crear la base si no existe.** `synchronize: true` crea las tablas, pero
 *    no la base que las contiene.
 * 2. **Vaciar el esquema.** Cada corrida arranca de cero, así que un test no
 *    puede depender de lo que dejó la corrida anterior.
 *
 * La base **no se borra al terminar**: recrearla en cada corrida es lento, y
 * dejarla en pie permite abrirla con un cliente SQL para entender por qué falló
 * un test. Lo que garantiza el aislamiento es que se vacía al **empezar**.
 */
export default async function prepararBaseDeDatos(): Promise<void> {
  cargarEnv({ quiet: true });

  const nombre = aplicarBaseDeDatosDePrueba();
  const conexion = datosDeConexion();

  try {
    await crearSiNoExiste(conexion, nombre);
    await vaciarEsquema(conexion);
  } catch (error) {
    throw new Error(
      `No se pudo preparar la base de prueba "${nombre}" en ` +
        `${conexion.host}:${conexion.port}.\n` +
        `¿Está levantada? Probá con: pnpm db:up\n` +
        `Causa: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log(`\n  Base de prueba lista: ${nombre}\n`);
}

async function crearSiNoExiste(
  conexion: ReturnType<typeof datosDeConexion>,
  nombre: string,
): Promise<void> {
  // Un `CREATE DATABASE` no se puede correr desde la base que se está creando,
  // así que se entra por la de mantenimiento.
  const cliente = new Client({ ...conexion, database: BASE_DE_MANTENIMIENTO });
  await cliente.connect();

  try {
    const existe = await cliente.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [nombre],
    );

    if (existe.rowCount === 0) {
      // El nombre no se puede parametrizar (es un identificador, no un valor).
      // Va sin escapar porque `exigirSufijoDePrueba` ya lo restringió a
      // [a-zA-Z0-9_].
      await cliente.query(`CREATE DATABASE "${nombre}"`);
    }
  } finally {
    await cliente.end();
  }
}

async function vaciarEsquema(
  conexion: ReturnType<typeof datosDeConexion>,
): Promise<void> {
  const cliente = new Client(conexion);
  await cliente.connect();

  try {
    // Más barato y más completo que truncar tabla por tabla: se lleva puestas
    // también las tablas que dejó una entidad que ya no existe.
    await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
    await cliente.query('CREATE SCHEMA public');
  } finally {
    await cliente.end();
  }
}
