import { ConfigService } from '@nestjs/config';
import { buildDatabaseOptions } from './database.config';
import {
  validateEnvironment,
  EnvironmentVariables,
} from './environment-variables';

const appKeys = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'not-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'key-of-google-maps',
  GEMINI_API_KEY: 'key-of-gemini',
};

const individualVariables = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'smartplan',
  DB_PASSWORD: 'smartplan',
  DB_NAME: 'smartplan',
};

function configFrom(
  environment: Record<string, string>,
): ConfigService<EnvironmentVariables, true> {
  return new ConfigService<EnvironmentVariables, true>(
    validateEnvironment({ ...appKeys, ...environment }),
  );
}

describe('buildDatabaseOptions', () => {
  it('builds the connection from individual variables', () => {
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

  it('prioriza DATABASE_URL when is definida', () => {
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

  it('active synchronize outside of production', () => {
    const options = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'development', ...individualVariables }),
    );

    expect(options.synchronize).toBe(true);
    expect(options.migrationsRun).toBe(false);
  });

  it('disables synchronize in production and runs migrations', () => {
    const options = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'production', ...individualVariables }),
    );

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(true);
  });

  it('apaga the log of queries in the tests', () => {
    const enTest = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'test', ...individualVariables }),
    );
    const inDevelopment = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'development', ...individualVariables }),
    );

    expect(enTest.logging).toBe(false);
    expect(inDevelopment.logging).toBe(true);
  });

  it('active SSL only when DB_SSL is in true', () => {
    const withoutSsl = buildDatabaseOptions(
      configFrom({ ...individualVariables, DB_SSL: 'false' }),
    );
    const withSsl = buildDatabaseOptions(
      configFrom({ ...individualVariables, DB_SSL: 'true' }),
    );

    expect(withoutSsl).toMatchObject({ ssl: false });
    expect(withSsl).toMatchObject({ ssl: { rejectUnauthorized: false } });
  });
});
