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

  it('prefers DATABASE_URL when it is defined', () => {
    const options = buildDatabaseOptions(
      configFrom({
        NODE_ENV: 'production',
        ALLOW_REMOTE_DATABASE: 'host',
        DATABASE_URL: 'postgresql://u:c@host:5432/smartplan',
        ...individualVariables,
      }),
    );

    expect(options).toMatchObject({
      url: 'postgresql://u:c@host:5432/smartplan',
    });
    expect(options).not.toHaveProperty('host');
  });

  it('refuses a remote database from a developer process even with NODE_ENV=production in .env', () => {
    expect(() =>
      buildDatabaseOptions(
        configFrom({
          NODE_ENV: 'production',
          DATABASE_URL:
            'postgresql://user:secret@trolley.proxy.rlwy.net:57059/railway',
        }),
      ),
    ).toThrow(/Refusing to connect to the remote database/);
  });

  it('never synchronises or auto-migrates an opted-in remote database', () => {
    const options = buildDatabaseOptions(
      configFrom({
        NODE_ENV: 'production',
        ALLOW_REMOTE_DATABASE: 'db.example.test',
        DATABASE_URL: 'postgresql://u:c@db.example.test:5432/smartplan',
      }),
    );
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('runs migrations on an opted-in remote database only with the second opt-in', () => {
    const options = buildDatabaseOptions(
      configFrom({
        NODE_ENV: 'production',
        ALLOW_REMOTE_DATABASE: 'db.example.test',
        ALLOW_REMOTE_MIGRATIONS: 'true',
        DATABASE_URL: 'postgresql://u:c@db.example.test:5432/smartplan',
      }),
    );
    expect(options.migrationsRun).toBe(true);
  });

  it('enables synchronize outside production', () => {
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

  it('disables TypeORM logging in every environment', () => {
    const inTest = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'test', ...individualVariables }),
    );
    const inDevelopment = buildDatabaseOptions(
      configFrom({ NODE_ENV: 'development', ...individualVariables }),
    );

    expect(inTest.logging).toBe(false);
    expect(inDevelopment.logging).toBe(false);
  });

  it('enables SSL only when DB_SSL is true', () => {
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
