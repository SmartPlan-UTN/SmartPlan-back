import { Environment } from './environment-variables';
import {
  validateWorkerEnvironment,
  WorkerEnvironmentVariables,
} from './worker-environment-variables';

describe('validateWorkerEnvironment', () => {
  it('acepta un environment completamente vacío', () => {
    // El aserto central del subconjunto: todo field del worker tiene default.
    const variables = validateWorkerEnvironment({});

    expect(variables).toBeInstanceOf(WorkerEnvironmentVariables);
  });

  it.each([
    'JWT_SECRET',
    'GOOGLE_MAPS_API_KEY',
    'GEMINI_API_KEY',
    'DATABASE_URL',
    'FRONTEND_URL',
  ])('no exige %s, que solo usa la API', (key) => {
    // Regresión: `validateWorkerEnvironment({})` nunca tira (lo afirma el test de
    // arriba), así que `expect(...).not.toThrow(key)` pasaría para
    // cualquier string sin verificar nada — no detectaría si alguien apunta
    // WorkerModule a `validateEnvironment`/`EnvironmentVariables` por error. La
    // aserción real es envelope el result: la key no puede ser una
    // property propia de la instancia que arma el validador del worker.
    const variables = validateWorkerEnvironment({});
    expect(Object.hasOwn(variables, key)).toBe(false);
  });

  it('aplica los valores por defecto', () => {
    const variables = validateWorkerEnvironment({});

    expect(variables.NODE_ENV).toBe(Environment.Development);
    expect(variables.RABBITMQ_URL).toBe(
      'amqp://smartplan:smartplan@localhost:5672',
    );
    expect(variables.RABBITMQ_PREFETCH).toBe(1);
    expect(variables.RABBITMQ_MAX_INTENTOS).toBe(3);
    expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
  });

  it('convierte los valores numéricos', () => {
    const variables = validateWorkerEnvironment({ RABBITMQ_PREFETCH: '5' });

    expect(variables.RABBITMQ_PREFETCH).toBe(5);
  });

  it('trata una key vacía como ausente', () => {
    const variables = validateWorkerEnvironment({
      RABBITMQ_URL: '',
      RABBITMQ_PREFETCH: '',
    });

    expect(variables.RABBITMQ_URL).toBe(
      'amqp://smartplan:smartplan@localhost:5672',
    );
    expect(variables.RABBITMQ_PREFETCH).toBe(1);
  });

  it('rechaza una RABBITMQ_URL mal formada', () => {
    expect(() =>
      validateWorkerEnvironment({ RABBITMQ_URL: 'http://localhost' }),
    ).toThrow('RABBITMQ_URL');
  });

  it('rechaza un RABBITMQ_PREFETCH fuera de rango', () => {
    expect(() => validateWorkerEnvironment({ RABBITMQ_PREFETCH: '0' })).toThrow(
      'RABBITMQ_PREFETCH',
    );
  });

  it('rechaza un RABBITMQ_RETRY_DELAYS_MS mal formado', () => {
    expect(() =>
      validateWorkerEnvironment({ RABBITMQ_RETRY_DELAYS_MS: '5000,abc' }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validateWorkerEnvironment({ NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });

  it('rechaza reattempts incoherentes', () => {
    expect(() =>
      validateWorkerEnvironment({
        RABBITMQ_MAX_INTENTOS: '3',
        RABBITMQ_RETRY_DELAYS_MS: '5000',
      }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('no incluye el value de RABBITMQ_URL en el message de error', () => {
    // El default de RABBITMQ_URL trae una credencial (amqp://smartplan:smartplan@...).
    const invalidUrl = 'http://user:secret-de-prueba@localhost';

    expect(() =>
      validateWorkerEnvironment({ RABBITMQ_URL: invalidUrl }),
    ).toThrow(
      expect.not.stringContaining('secret-de-prueba') as unknown as string,
    );
  });
});
