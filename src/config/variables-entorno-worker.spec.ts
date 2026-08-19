import { Entorno } from './variables-entorno';
import {
  validarEntornoWorker,
  VariablesEntornoWorker,
} from './variables-entorno-worker';

describe('validarEntornoWorker', () => {
  it('acepta un entorno completamente vacío', () => {
    // El aserto central del subconjunto: todo campo del worker tiene default.
    const variables = validarEntornoWorker({});

    expect(variables).toBeInstanceOf(VariablesEntornoWorker);
  });

  it.each([
    'JWT_SECRET',
    'GOOGLE_MAPS_API_KEY',
    'GEMINI_API_KEY',
    'DATABASE_URL',
    'FRONTEND_URL',
  ])('no exige %s, que solo usa la API', (clave) => {
    // Regresión: `validarEntornoWorker({})` nunca tira (lo afirma el test de
    // arriba), así que `expect(...).not.toThrow(clave)` pasaría para
    // cualquier string sin verificar nada — no detectaría si alguien apunta
    // WorkerModule a `validarEntorno`/`VariablesEntorno` por error. La
    // aserción real es sobre el resultado: la clave no puede ser una
    // propiedad propia de la instancia que arma el validador del worker.
    const variables = validarEntornoWorker({});
    expect(Object.hasOwn(variables, clave)).toBe(false);
  });

  it('aplica los valores por defecto', () => {
    const variables = validarEntornoWorker({});

    expect(variables.NODE_ENV).toBe(Entorno.Desarrollo);
    expect(variables.RABBITMQ_URL).toBe(
      'amqp://smartplan:smartplan@localhost:5672',
    );
    expect(variables.RABBITMQ_PREFETCH).toBe(1);
    expect(variables.RABBITMQ_MAX_INTENTOS).toBe(3);
    expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
  });

  it('convierte los valores numéricos', () => {
    const variables = validarEntornoWorker({ RABBITMQ_PREFETCH: '5' });

    expect(variables.RABBITMQ_PREFETCH).toBe(5);
  });

  it('trata una clave vacía como ausente', () => {
    const variables = validarEntornoWorker({
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
      validarEntornoWorker({ RABBITMQ_URL: 'http://localhost' }),
    ).toThrow('RABBITMQ_URL');
  });

  it('rechaza un RABBITMQ_PREFETCH fuera de rango', () => {
    expect(() => validarEntornoWorker({ RABBITMQ_PREFETCH: '0' })).toThrow(
      'RABBITMQ_PREFETCH',
    );
  });

  it('rechaza un RABBITMQ_RETRY_DELAYS_MS mal formado', () => {
    expect(() =>
      validarEntornoWorker({ RABBITMQ_RETRY_DELAYS_MS: '5000,abc' }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validarEntornoWorker({ NODE_ENV: 'staging' })).toThrow(
      'NODE_ENV',
    );
  });

  it('rechaza reintentos incoherentes', () => {
    expect(() =>
      validarEntornoWorker({
        RABBITMQ_MAX_INTENTOS: '3',
        RABBITMQ_RETRY_DELAYS_MS: '5000',
      }),
    ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
  });

  it('no incluye el valor de RABBITMQ_URL en el mensaje de error', () => {
    // El default de RABBITMQ_URL trae una credencial (amqp://smartplan:smartplan@...).
    const urlInvalida = 'http://usuario:secreto-de-prueba@localhost';

    expect(() => validarEntornoWorker({ RABBITMQ_URL: urlInvalida })).toThrow(
      expect.not.stringContaining('secreto-de-prueba') as unknown as string,
    );
  });
});
