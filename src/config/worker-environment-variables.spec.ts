import { Environment } from './environment-variables';
import {
  validateWorkerEnvironment,
  WorkerEnvironmentVariables,
} from './worker-environment-variables';

const validWorkerEnvironment = {
  DATABASE_URL: 'postgresql://smartplan:key@localhost:5432/smartplan',
  GOOGLE_MAPS_API_KEY: 'key-of-google-maps',
};

describe('validateWorkerEnvironment', () => {
  it('accepts the database and Google Maps configuration used by the sync worker', () => {
    const variables = validateWorkerEnvironment(validWorkerEnvironment);

    expect(variables).toBeInstanceOf(WorkerEnvironmentVariables);
  });

  it.each(['JWT_SECRET', 'GEMINI_API_KEY', 'FRONTEND_URL'])(
    'does not require API-only key %s',
    (key) => {
      const variables = validateWorkerEnvironment(validWorkerEnvironment);
      expect(Object.hasOwn(variables, key)).toBe(false);
    },
  );

  it('requires the Google Maps key used by external synchronization', () => {
    expect(() =>
      validateWorkerEnvironment({
        DATABASE_URL: validWorkerEnvironment.DATABASE_URL,
      }),
    ).toThrow('GOOGLE_MAPS_API_KEY');
  });

  it('requires a database connection used by external synchronization', () => {
    expect(() =>
      validateWorkerEnvironment({
        GOOGLE_MAPS_API_KEY: validWorkerEnvironment.GOOGLE_MAPS_API_KEY,
      }),
    ).toThrow('PostgreSQL connection');
  });

  it('applies the values by default', () => {
    const variables = validateWorkerEnvironment(validWorkerEnvironment);

    expect(variables.NODE_ENV).toBe(Environment.Development);
    expect(variables.RABBITMQ_URL).toBe(
      'amqp://smartplan:smartplan@localhost:5672',
    );
    expect(variables.RABBITMQ_PREFETCH).toBe(1);
    expect(variables.RABBITMQ_MAX_ATTEMPTS).toBe(3);
    expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
  });

  it('converts numeric values', () => {
    const variables = validateWorkerEnvironment({
      ...validWorkerEnvironment,
      RABBITMQ_PREFETCH: '5',
    });

    expect(variables.RABBITMQ_PREFETCH).toBe(5);
  });

  it('treats an empty key as absent', () => {
    const variables = validateWorkerEnvironment({
      ...validWorkerEnvironment,
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
        ...validWorkerEnvironment,
        RABBITMQ_URL: 'http://localhost',
      }),
    ).toThrow('RABBITMQ_URL');
  });

  it('rejects a RABBITMQ_PREFETCH outside of range', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validWorkerEnvironment,
        RABBITMQ_PREFETCH: '0',
      }),
    ).toThrow('RABBITMQ_PREFETCH');
  });

  it('rejects a RABBITMQ_RETRY_DELAYS_MS mal formado', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validWorkerEnvironment,
        RABBITMQ_RETRY_DELAYS_MS: '5000,abc',
      }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('rejects a NODE_ENV unknown', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validWorkerEnvironment,
        NODE_ENV: 'staging',
      }),
    ).toThrow('NODE_ENV');
  });

  it('rejects reattempts inconsistent', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...validWorkerEnvironment,
        RABBITMQ_MAX_ATTEMPTS: '3',
        RABBITMQ_RETRY_DELAYS_MS: '5000',
      }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('does not include the value of RABBITMQ_URL in the message of error', () => {
    const invalidUrl = 'http://user:secret-of-test@localhost';

    expect(() =>
      validateWorkerEnvironment({
        ...validWorkerEnvironment,
        RABBITMQ_URL: invalidUrl,
      }),
    ).toThrow(
      expect.not.stringContaining('secret-of-test') as unknown as string,
    );
  });
});
