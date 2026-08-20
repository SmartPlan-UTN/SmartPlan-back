import {
  Environment,
  validateEnvironment,
  EnvironmentVariables,
} from './environment-variables';

/** Environment mínimo válido. Cada test parte de acá y rompe una sola cosa. */
const validEnvironment = {
  DATABASE_URL: 'postgresql://smartplan:key@localhost:5432/smartplan',
  JWT_SECRET: 'a'.repeat(32),
  GOOGLE_MAPS_API_KEY: 'key-de-google-maps',
  GEMINI_API_KEY: 'key-de-gemini',
};

describe('validateEnvironment', () => {
  it('acepta un environment completo y devuelve las variables tipadas', () => {
    const variables = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      PORT: '8080',
    });

    expect(variables).toBeInstanceOf(EnvironmentVariables);
    expect(variables.NODE_ENV).toBe(Environment.Produccion);
    expect(variables.DATABASE_URL).toBe(validEnvironment.DATABASE_URL);
  });

  it('convierte PORT a número', () => {
    const variables = validateEnvironment({
      ...validEnvironment,
      PORT: '8080',
    });

    expect(variables.PORT).toBe(8080);
  });

  it('aplica los valores por defecto de la aplicacion', () => {
    const variables = validateEnvironment(validEnvironment);

    expect(variables.NODE_ENV).toBe(Environment.Development);
    expect(variables.PORT).toBe(3001);
    expect(variables.FRONTEND_URL).toBe('http://localhost:3000');
  });

  it.each([
    'DATABASE_URL',
    'JWT_SECRET',
    'GOOGLE_MAPS_API_KEY',
    'GEMINI_API_KEY',
  ])('falla si falta %s', (key) => {
    const environment = { ...validEnvironment };
    delete environment[key as keyof typeof environment];

    expect(() => validateEnvironment(environment)).toThrow(key);
  });

  it('rechaza una DATABASE_URL que no sea postgresql://', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'mysql://localhost/db',
      }),
    ).toThrow('DATABASE_URL');
  });

  it('rechaza un JWT_SECRET más corto que 32 caracteres', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: 'corto' }),
    ).toThrow('JWT_SECRET');
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, NODE_ENV: 'staging' }),
    ).toThrow('NODE_ENV');
  });

  it('rechaza un PORT fuera de rango', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrow('PORT');
  });

  it('trata una key vacía como ausente', () => {
    // `.env.example` list las claves sin value: un `cp .env.example .env` deja
    // las opcionales en string vacío y la app tiene que arrancar igual.
    const variables = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: '',
      PORT: '',
    });

    expect(variables.NODE_ENV).toBe(Environment.Development);
    expect(variables.PORT).toBe(3001);
  });

  it('rechaza una FRONTEND_URL sin protocolo', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        FRONTEND_URL: 'localhost:3000',
      }),
    ).toThrow('FRONTEND_URL');
  });

  it('acepta un origen HTTPS configurable para el frontend', () => {
    const variables = validateEnvironment({
      ...validEnvironment,
      FRONTEND_URL: 'https://smartplan.example.com',
    });

    expect(variables.FRONTEND_URL).toBe('https://smartplan.example.com');
  });

  // Una navbar final o una route pasan `@IsUrl` pero no sirven como origen: el
  // navegador compara el `Access-Control-Allow-Origin` carácter por carácter.
  // Sin esta validación la aplicación arranca y después bloquea todo el
  // frontend con un error de CORS que no explica la cause.
  it.each([
    ['con navbar final', 'https://smartplan.example.com/'],
    ['con una route', 'https://smartplan.example.com/app'],
  ])('rechaza una FRONTEND_URL %s', (_caso, value) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, FRONTEND_URL: value }),
    ).toThrow('FRONTEND_URL');
  });

  describe('formas de configurar la conexión', () => {
    const withoutConnection = {
      JWT_SECRET: 'a'.repeat(32),
      GOOGLE_MAPS_API_KEY: 'key-de-google-maps',
      GEMINI_API_KEY: 'key-de-gemini',
    };

    const individualVariables = {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USER: 'smartplan',
      DB_PASSWORD: 'smartplan',
      DB_NAME: 'smartplan',
    };

    it('acepta las DB_* sueltas en place de DATABASE_URL', () => {
      const variables = validateEnvironment({
        ...withoutConnection,
        ...individualVariables,
      });

      expect(variables.DATABASE_URL).toBeUndefined();
      expect(variables.DB_HOST).toBe('localhost');
      expect(variables.DB_PORT).toBe(5433);
    });

    it('aplica 5432 como DB_PORT por defecto', () => {
      const sinPuerto = { ...individualVariables };
      delete (sinPuerto as Partial<typeof individualVariables>).DB_PORT;

      const variables = validateEnvironment({
        ...withoutConnection,
        ...sinPuerto,
      });

      expect(variables.DB_PORT).toBe(5432);
    });

    it('falla si no hay ninguna de las dos formas', () => {
      expect(() => validateEnvironment(withoutConnection)).toThrow(
        /DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/,
      );
    });

    it('falla si las DB_* están incompletas', () => {
      expect(() =>
        validateEnvironment({ ...withoutConnection, DB_HOST: 'localhost' }),
      ).toThrow(/DB_USER, DB_PASSWORD, DB_NAME/);
    });

    it('rechaza un DB_PORT fuera de rango', () => {
      expect(() =>
        validateEnvironment({
          ...withoutConnection,
          ...individualVariables,
          DB_PORT: '0',
        }),
      ).toThrow('DB_PORT');
    });
  });

  it('no incluye el value del secret en el message de error', () => {
    const secret = 'secret-que-no-debe-aparecer';

    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: secret }),
    ).toThrow(expect.not.stringContaining(secret) as unknown as string);
  });

  // F12 — las claves de RabbitMQ viven en CommonEnvironmentVariables, heredada
  // por EnvironmentVariables. Cobertura mínima acá: suficiente para detectar si
  // se rompe el `extends`. La matriz completa de decoradores vive en
  // worker-environment-variables.spec.ts, que es el esquema que realmente
  // depende de estas claves para arrancar sin nada más.
  describe('RabbitMQ', () => {
    it('aplica los valores por defecto de RabbitMQ', () => {
      const variables = validateEnvironment(validEnvironment);

      expect(variables.RABBITMQ_URL).toBe(
        'amqp://smartplan:smartplan@localhost:5672',
      );
      expect(variables.RABBITMQ_PREFETCH).toBe(1);
      expect(variables.RABBITMQ_MAX_INTENTOS).toBe(3);
      expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
    });

    it('rechaza una RABBITMQ_URL que no sea amqp:// ni amqps://', () => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          RABBITMQ_URL: 'http://localhost',
        }),
      ).toThrow('RABBITMQ_URL');
    });

    it('rechaza reattempts incoherentes con RABBITMQ_MAX_INTENTOS (faltan demoras)', () => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          RABBITMQ_MAX_INTENTOS: '3',
          RABBITMQ_RETRY_DELAYS_MS: '5000',
        }),
      ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
    });

    it('rechaza más attempts que demoras configuradas (queues de retry insuficientes)', () => {
      // Regresión del hallazgo de code review: con la validación anterior
      // (`>=` en vez de `===`), RABBITMQ_MAX_INTENTOS=4 con solo 2 demoras
      // pasaba la validación. messaging.config.ts declara exactamente una
      // queue de retry por demora (acá, 2), así que el cuarto attempt
      // republicaba a una routing key ("*.retry.3") sin queue/binding — en
      // un exchange direct esa publicación se confirma igual y el job
      // desaparecía en silencio en vez de terminar en la DLQ.
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          RABBITMQ_MAX_INTENTOS: '4',
          RABBITMQ_RETRY_DELAYS_MS: '5000,30000',
        }),
      ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
    });
  });
});
