import { Environment } from './environment-variables';
import {
  validateWorkerEnvironment,
  WorkerEnvironmentVariables,
} from './worker-environment-variables';

describe('validateWorkerEnvironment', () => {
  it('accepts a completely empty environment', () => {
    const variables = validateWorkerEnvironment({});

    expect(variables).toBeInstanceOf(WorkerEnvironmentVariables);
  });

  it.each([
    'JWT_SECRET',
    'GOOGLE_MAPS_API_KEY',
    'GEMINI_API_KEY',
    'DATABASE_URL',
    'FRONTEND_URL',
  ])('does not require %s, that only uses the API', (key) => {
    const variables = validateWorkerEnvironment({});
    expect(Object.hasOwn(variables, key)).toBe(false);
  });

  it('applies the values by default', () => {
    const variables = validateWorkerEnvironment({});

    expect(variables.NODE_ENV).toBe(Environment.Development);
    expect(variables.RABBITMQ_URL).toBe(
      'amqp://smartplan:smartplan@localhost:5672',
    );
    expect(variables.RABBITMQ_PREFETCH).toBe(1);
    expect(variables.RABBITMQ_MAX_ATTEMPTS).toBe(3);
    expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
  });

  it('converts numeric values', () => {
    const variables = validateWorkerEnvironment({ RABBITMQ_PREFETCH: '5' });

    expect(variables.RABBITMQ_PREFETCH).toBe(5);
  });

  it('treats an empty key as absent', () => {
    const variables = validateWorkerEnvironment({
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
      validateWorkerEnvironment({ RABBITMQ_URL: 'http://localhost' }),
    ).toThrow('RABBITMQ_URL');
  });

  it('rejects a RABBITMQ_PREFETCH outside of range', () => {
    expect(() => validateWorkerEnvironment({ RABBITMQ_PREFETCH: '0' })).toThrow(
      'RABBITMQ_PREFETCH',
    );
  });

  it('rejects a RABBITMQ_RETRY_DELAYS_MS mal formado', () => {
    expect(() =>
      validateWorkerEnvironment({ RABBITMQ_RETRY_DELAYS_MS: '5000,abc' }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('rejects a NODE_ENV unknown', () => {
    expect(() => validateWorkerEnvironment({ NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });

  it('rejects reattempts inconsistent', () => {
    expect(() =>
      validateWorkerEnvironment({
        RABBITMQ_MAX_ATTEMPTS: '3',
        RABBITMQ_RETRY_DELAYS_MS: '5000',
      }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('does not include the value of RABBITMQ_URL in the message of error', () => {
    const invalidUrl = 'http://user:secret-of-test@localhost';

    expect(() =>
      validateWorkerEnvironment({ RABBITMQ_URL: invalidUrl }),
    ).toThrow(
      expect.not.stringContaining('secret-of-test') as unknown as string,
    );
  });
});
