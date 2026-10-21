import { Environment } from './environment-variables';
import {
  validateWorkerEnvironment,
  WorkerEnvironmentVariables,
} from './worker-environment-variables';

const validEnvironment = {
  DATABASE_URL: 'postgresql://smartplan:key@localhost:5432/smartplan',
  GOOGLE_MAPS_API_KEY: 'key-of-google-maps',
  GEMINI_API_KEY: 'key-of-gemini',
};

describe('validateWorkerEnvironment', () => {
  it('accepts a complete environment', () => {
    const variables = validateWorkerEnvironment(validEnvironment);

    expect(variables).toBeInstanceOf(WorkerEnvironmentVariables);
  });

  it.each(['JWT_SECRET', 'FRONTEND_URL', 'PORT', 'RESEND_API_KEY'])(
    'does not require %s, that only uses the API',
    (key) => {
      const variables = validateWorkerEnvironment(validEnvironment);
      expect(Object.hasOwn(variables, key)).toBe(false);
    },
  );

  it.each(['DATABASE_URL', 'GOOGLE_MAPS_API_KEY', 'GEMINI_API_KEY'])(
    'requires %s: the worker calls Postgres, Gemini, and Google Maps directly',
    (key) => {
      const environment = { ...validEnvironment };
      delete environment[key as keyof typeof environment];

      expect(() => validateWorkerEnvironment(environment)).toThrow(key);
    },
  );

  it('reports the missing database connection without a raw key name', () => {
    expect(() =>
      validateWorkerEnvironment({
        GOOGLE_MAPS_API_KEY: validEnvironment.GOOGLE_MAPS_API_KEY,
        GEMINI_API_KEY: validEnvironment.GEMINI_API_KEY,
      }),
    ).toThrow('PostgreSQL connection');
  });

  it('accepts the individual DB_* variables instead of DATABASE_URL', () => {
    const withoutUrl: Record<string, string> = { ...validEnvironment };
    delete withoutUrl.DATABASE_URL;
    const variables = validateWorkerEnvironment({
      ...withoutUrl,
      DB_HOST: 'localhost',
      DB_USER: 'smartplan',
      DB_PASSWORD: 'smartplan',
      DB_NAME: 'smartplan',
    });

    expect(variables.DB_HOST).toBe('localhost');
  });

  it('applies the values by default', () => {
    const variables = validateWorkerEnvironment(validEnvironment);

    expect(variables.NODE_ENV).toBe(Environment.Development);
    expect(variables.RABBITMQ_URL).toBe(
      'amqp://smartplan:smartplan@localhost:5672',
    );
    expect(variables.RABBITMQ_PREFETCH).toBe(1);
    expect(variables.RABBITMQ_MAX_ATTEMPTS).toBe(3);
    expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
    expect(variables.GEMINI_MODEL).toBe('gemini-3.6-flash');
  });

  it('converts numeric values', () => {
    const variables = validateWorkerEnvironment({
      ...validEnvironment,
      RABBITMQ_PREFETCH: '5',
    });

    expect(variables.RABBITMQ_PREFETCH).toBe(5);
  });

  it('treats an empty key as absent', () => {
    const variables = validateWorkerEnvironment({
      ...validEnvironment,
      RABBITMQ_URL: '',
      RABBITMQ_PREFETCH: '',
    });

    expect(variables.RABBITMQ_URL).toBe(
      'amqp://smartplan:smartplan@localhost:5672',
    );
    expect(variables.RABBITMQ_PREFETCH).toBe(1);
  });

  it('rejects a RABBITMQ_URL malformed', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validEnvironment,
        RABBITMQ_URL: 'http://localhost',
      }),
    ).toThrow('RABBITMQ_URL');
  });

  it('rejects a RABBITMQ_PREFETCH outside of range', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validEnvironment,
        RABBITMQ_PREFETCH: '0',
      }),
    ).toThrow('RABBITMQ_PREFETCH');
  });

  it('rejects a RABBITMQ_RETRY_DELAYS_MS mal formado', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validEnvironment,
        RABBITMQ_RETRY_DELAYS_MS: '5000,abc',
      }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('rejects a NODE_ENV unknown', () => {
    expect(() =>
      validateWorkerEnvironment({ ...validEnvironment, NODE_ENV: 'staging' }),
    ).toThrow('NODE_ENV');
  });

  it('rejects reattempts inconsistent', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validEnvironment,
        RABBITMQ_MAX_ATTEMPTS: '3',
        RABBITMQ_RETRY_DELAYS_MS: '5000',
      }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('does not include the value of RABBITMQ_URL in the message of error', () => {
    const invalidUrl = 'http://user:secret-of-test@localhost';

    expect(() =>
      validateWorkerEnvironment({
        ...validEnvironment,
        RABBITMQ_URL: invalidUrl,
      }),
    ).toThrow(
      expect.not.stringContaining('secret-of-test') as unknown as string,
    );
  });
});
