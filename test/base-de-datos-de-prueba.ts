/**
 * Base de datos de prueba aislada.
 *
 * Los e2e levantan el `AppModule` entero, y desde F01 eso abre una conexión real
 * a PostgreSQL con `synchronize: true`. Sin aislar, los tests reescribirían el
 * esquema de la base de desarrollo y se llevarían puestos los datos con los que
 * estabas trabajando.
 *
 * La solución es apuntar el entorno de los tests a **otra base**, en el mismo
 * servidor: `smartplan` para desarrollar, `smartplan_test` para los tests.
 *
 * Ese cambio de nombre lo hace {@link aplicarBaseDeDatosDePrueba}, y lo protege
 * {@link exigirSufijoDePrueba}: si por lo que sea el nombre no termina en
 * `_test`, los tests fallan de entrada en vez de tocar una base que no les
 * corresponde.
 */

/** Todo nombre de base de prueba termina con esto. Es la red de seguridad. */
export const SUFIJO_DE_PRUEBA = '_test';

/** Base de mantenimiento: siempre existe, y desde ahí se crean las demás. */
export const BASE_DE_MANTENIMIENTO = 'postgres';

/** Datos sueltos de conexión, que es lo que espera el cliente `pg`. */
export interface DatosDeConexion {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Falla si el nombre no es el de una base de prueba.
 *
 * Es a propósito una excepción y no un warning: preferimos un test que no corre
 * antes que un test que le pasa `DROP SCHEMA` a la base equivocada.
 */
export function exigirSufijoDePrueba(nombre: string): string {
  if (!nombre.endsWith(SUFIJO_DE_PRUEBA)) {
    throw new Error(
      `La base de prueba es "${nombre}", que no termina en "${SUFIJO_DE_PRUEBA}".\n` +
        `Los tests borran y recrean el esquema, así que solo corren contra una base ` +
        `de prueba.\nRevisá DB_NAME_TEST o DB_NAME en tu .env.`,
    );
  }

  // El nombre entra sin escapar en un `CREATE DATABASE` (los identificadores de
  // SQL no se pueden parametrizar), así que se restringe a lo que puede ser un
  // identificador y nada más.
  if (!/^[a-zA-Z0-9_]+$/.test(nombre)) {
    throw new Error(
      `El nombre de la base de prueba "${nombre}" tiene caracteres no permitidos. ` +
        `Solo letras, números y guion bajo.`,
    );
  }

  return nombre;
}

/** Nombre de la base de prueba: `DB_NAME_TEST`, o `<DB_NAME>_test`. */
export function nombreDeLaBaseDePrueba(
  entorno: NodeJS.ProcessEnv = process.env,
): string {
  if (entorno.DB_NAME_TEST) {
    return entorno.DB_NAME_TEST;
  }

  const base = entorno.DB_NAME ?? 'smartplan';

  // Si DB_NAME ya viene apuntando a una base de prueba, no se le encaja un
  // segundo sufijo (`smartplan_test_test`).
  return base.endsWith(SUFIJO_DE_PRUEBA) ? base : `${base}${SUFIJO_DE_PRUEBA}`;
}

/** Reemplaza el nombre de la base dentro de una `DATABASE_URL`. */
function conOtraBase(url: string, nombre: string): string {
  const partes = new URL(url);
  partes.pathname = `/${nombre}`;
  return partes.toString();
}

/**
 * Reescribe el entorno para que apunte a la base de prueba.
 *
 * Muta `process.env` porque es lo que va a leer `construirOpcionesDeBaseDeDatos`
 * cuando el `AppModule` levante la conexión. Cubre las dos formas de configurar
 * la base que acepta el esquema (`DATABASE_URL` y las `DB_*` sueltas), porque si
 * solo se cambiara una, la otra podría seguir apuntando a la de desarrollo.
 *
 * Devuelve el nombre de la base para que quien la llame pueda loguearlo.
 */
export function aplicarBaseDeDatosDePrueba(
  entorno: NodeJS.ProcessEnv = process.env,
): string {
  const nombre = exigirSufijoDePrueba(nombreDeLaBaseDePrueba(entorno));

  if (entorno.DATABASE_URL) {
    entorno.DATABASE_URL = conOtraBase(entorno.DATABASE_URL, nombre);
  }

  entorno.DB_NAME = nombre;

  return nombre;
}

/**
 * Datos de conexión al servidor de PostgreSQL, para hablarle con el cliente `pg`
 * sin pasar por TypeORM (crear la base, limpiar el esquema).
 *
 * `DATABASE_URL` gana sobre las `DB_*`, igual que en
 * `src/config/database.config.ts`.
 */
export function datosDeConexion(
  entorno: NodeJS.ProcessEnv = process.env,
): DatosDeConexion {
  if (entorno.DATABASE_URL) {
    const partes = new URL(entorno.DATABASE_URL);

    return {
      host: partes.hostname,
      port: Number(partes.port || 5432),
      user: decodeURIComponent(partes.username),
      password: decodeURIComponent(partes.password),
      database: partes.pathname.replace(/^\//, ''),
    };
  }

  return {
    host: entorno.DB_HOST ?? 'localhost',
    port: Number(entorno.DB_PORT ?? 5432),
    user: entorno.DB_USER ?? 'smartplan',
    password: entorno.DB_PASSWORD ?? 'smartplan',
    database: entorno.DB_NAME ?? nombreDeLaBaseDePrueba(entorno),
  };
}
