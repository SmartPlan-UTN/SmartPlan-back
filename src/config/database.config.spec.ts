import { ConfigService } from '@nestjs/config';
import { buildDatabaseOptions } from './database.config';
import {
  validateEnvironment,
  EnvironmentVariables,
} from './environment-variables';

/** Claves que el esquema exige más allá de la base de data. */
const appKeys = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'no-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'key-de-google-maps',
  GEMINI_API_KEY: 'key-de-gemini',
};

const individualVariables = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'smartplan',
  DB_PASSWORD: 'smartplan',
  DB_NAME: 'smartplan',
};

/** Pasa el environment por la misma validación que corre al arrancar la app. */
function configFrom(
  environment: Record<string, string>,
): ConfigService<EnvironmentVariables, true> {
  return new ConfigService<EnvironmentVariables, true>(
    validateEnvironment({ ...appKeys, ...environment }),
  );
}

describe('buildDatabaseOptions', () => {
  it('arma la conexión a partir de las variables sueltas', () => {
    const options = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'development', ...individualVariables }),
    );

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'smartplan',
      password: 'smartplan',
      database: 'smartplan',
    });
  });

  it('prioriza DATABASE_URL cuando está definida', () => {
    const options = buildDatabaseOptions(
      configFrom({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:c@host:5432/smartplan',
        ...individualVariables,
      }),
    );

    expect(options).toMatchObject({
      url: 'postgresql://u:c@host:5432/smartplan',
    });
    expect(options).not.toHaveProperty('host');
  });

  it('active synchronize fuera de producción', () => {
    const options = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'development', ...individualVariables }),
    );

    expect(options.synchronize).toBe(true);
    expect(options.migrationsRun).toBe(false);
  });

  it('desactiva synchronize en producción y corre migraciones', () => {
    const options = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'production', ...individualVariables }),
    );

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(true);
  });

  it('apaga el log de queries en los tests', () => {
    // El log de TypeORM tapa la salida de Jest: en `test` estorba más de lo que
    // ayuda. En desarrolelo sigue encendido.
    const enTest = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'test', ...individualVariables }),
    );
    const inDevelopment = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'development', ...individualVariables }),
    );

    expect(enTest.logging).toBe(false);
    expect(inDevelopment.logging).toBe(true);
  });

  it('active SSL solo cuando DB_SSL está en true', () => {
    const sinSsl = buildDatabaseOptions(
      configFrom({ ...individualVariables, DB_SSL: 'false' }),
    );
    const conSsl = buildDatabaseOptions(
      configFrom({ ...individualVariables, DB_SSL: 'true' }),
    );

    expect(sinSsl).toMatchObject({ ssl: false });
    expect(conSsl).toMatchObject({ ssl: { rejectUnauthorized: false } });
  });
});
