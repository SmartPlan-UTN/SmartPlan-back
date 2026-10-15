export const TEST_SUFFIX = '_test';

export const MAINTENANCE_DATABASE = 'postgres';

export interface ConnectionData {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function requireTestSuffix(name: string): string {
  if (!name.endsWith(TEST_SUFFIX)) {
    throw new Error(
      `The test database is "${name}", which does not end in "${TEST_SUFFIX}".\n` +
        `Tests drop and recreate the schema, so they may run only against a test database.\n` +
        `Review DB_NAME_TEST or DB_NAME in your .env.`,
    );
  }

  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(
      `The test database name "${name}" contains invalid characters. ` +
        `Only letters, numbers, and underscores are allowed.`,
    );
  }

  return name;
}

export function getTestDatabaseName(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (environment.DB_NAME_TEST) {
    return environment.DB_NAME_TEST;
  }

  const baseName = environment.DB_NAME ?? 'smartplan';

  return baseName.endsWith(TEST_SUFFIX)
    ? baseName
    : `${baseName}${TEST_SUFFIX}`;
}

function withDifferentDatabase(url: string, name: string): string {
  const parts = new URL(url);
  parts.pathname = `/${name}`;
  return parts.toString();
}

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
