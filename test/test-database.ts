/**
 * Base de data de prueba aislada.
 *
 * Los e2e levantan el `AppModule` entero, y desde F01 eso abre una conexión real
 * a PostgreSQL con `synchronize: true`. Sin aislar, los tests reescribirían el
 * esquema de la base de desarrolelo y se llevarían puestos los data con los que
 * estabas trabajando.
 *
 * La solución es apuntar el environment de los tests a **otra base**, en el mismo
 * servidor: `smartplan` para desarrolelar, `smartplan_test` para los tests.
 *
 * Ese cambio de name lo hace {@link applyTestDatabase}, y lo protege
 * {@link requireTestSuffix}: si por lo que sea el name no termina en
 * `_test`, los tests fallan de input en vez de tocar una base que no les
 * corresponde.
 */

/** Todo name de base de prueba termina con esto. Es la red de seguridad. */
export const TEST_SUFFIX = '_test';

/** Base de mantenimiento: siempre existe, y desde ahí se crean las demás. */
export const MAINTENANCE_DATABASE = 'postgres';

/** Data sueltos de conexión, que es lo que espera el client `pg`. */
export interface ConnectionData {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Falla si el name no es el de una base de prueba.
 *
 * Es a propósito una excepción y no un warning: preferimos un test que no corre
 * antes que un test que le pasa `DROP SCHEMA` a la base equivocada.
 */
export function requireTestSuffix(name: string): string {
  if (!name.endsWith(TEST_SUFFIX)) {
    throw new Error(
      `La base de prueba es "${name}", que no termina en "${TEST_SUFFIX}".\n` +
        `Los tests borran y recrean el esquema, así que solo corren contra una base ` +
        `de prueba.\nRevisá DB_NAME_TEST o DB_NAME en tu .env.`,
    );
  }

  // El name entra sin escapar en un `CREATE DATABASE` (los identificadores de
  // SQL no se pueden parametrizar), así que se restringe a lo que puede ser un
  // identificador y nada más.
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(
      `El name de la base de prueba "${name}" tiene caracteres no permitidos. ` +
        `Solo letras, números y guion bajo.`,
    );
  }

  return name;
}

/** Nombre de la base de prueba: `DB_NAME_TEST`, o `<DB_NAME>_test`. */
export function getTestDatabaseName(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (environment.DB_NAME_TEST) {
    return environment.DB_NAME_TEST;
  }

  const base = environment.DB_NAME ?? 'smartplan';

  // Si DB_NAME ya viene apuntando a una base de prueba, no se le encaja un
  // segundo sufijo (`smartplan_test_test`).
  return base.endsWith(TEST_SUFFIX) ? base : `${base}${TEST_SUFFIX}`;
}

/** Reemplaza el name de la base dentro de una `DATABASE_URL`. */
function withDifferentDatabase(url: string, name: string): string {
  const parts = new URL(url);
  parts.pathname = `/${name}`;
  return parts.toString();
}

/**
 * Reescribe el environment para que apunte a la base de prueba.
 *
 * Muta `process.env` porque es lo que va a leer `buildDatabaseOptions`
 * cuando el `AppModule` levante la conexión. Cubre las dos formas de configurar
 * la base que acepta el esquema (`DATABASE_URL` y las `DB_*` sueltas), porque si
 * solo se cambiara una, la otra podría seguir apuntando a la de desarrolelo.
 *
 * Devuelve el name de la base para que quien la llame pueda loguearlo.
 */
export function applyTestDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const name = requireTestSuffix(getTestDatabaseName(environment));

  if (environment.DATABASE_URL) {
    environment.DATABASE_URL = withDifferentDatabase(
      environment.DATABASE_URL,
      name,
    );
  }

  environment.DB_NAME = name;

  return name;
}

/**
 * Data de conexión al servidor de PostgreSQL, para hablarle con el client `pg`
 * sin pasar por TypeORM (crear la base, limpiar el esquema).
 *
 * `DATABASE_URL` gana envelope las `DB_*`, igual que en
 * `src/config/database.config.ts`.
 */
export function getConnectionData(
  environment: NodeJS.ProcessEnv = process.env,
): ConnectionData {
  if (environment.DATABASE_URL) {
    const parts = new URL(environment.DATABASE_URL);

    return {
      host: parts.hostname,
      port: Number(parts.port || 5432),
      user: decodeURIComponent(parts.username),
      password: decodeURIComponent(parts.password),
      database: parts.pathname.replace(/^\//, ''),
    };
  }

  return {
    host: environment.DB_HOST ?? 'localhost',
    port: Number(environment.DB_PORT ?? 5432),
    user: environment.DB_USER ?? 'smartplan',
    password: environment.DB_PASSWORD ?? 'smartplan',
    database: environment.DB_NAME ?? getTestDatabaseName(environment),
  };
}
