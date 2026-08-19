import { Entorno, validarEntorno, VariablesEntorno } from './variables-entorno';

/** Entorno mínimo válido. Cada test parte de acá y rompe una sola cosa. */
const entornoValido = {
  DATABASE_URL: 'postgresql://smartplan:clave@localhost:5432/smartplan',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  RESEND_API_KEY: 're_prueba',
  EMAIL_FROM: 'no-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'clave-de-google-maps',
  GEMINI_API_KEY: 'clave-de-gemini',
};

describe('validarEntorno', () => {
  it('acepta un entorno completo y devuelve las variables tipadas', () => {
    const variables = validarEntorno({
      ...entornoValido,
      NODE_ENV: 'production',
      PORT: '8080',
    });

    expect(variables).toBeInstanceOf(VariablesEntorno);
    expect(variables.NODE_ENV).toBe(Entorno.Produccion);
    expect(variables.DATABASE_URL).toBe(entornoValido.DATABASE_URL);
  });

  it('convierte PORT a número', () => {
    const variables = validarEntorno({ ...entornoValido, PORT: '8080' });

    expect(variables.PORT).toBe(8080);
  });

  it('aplica los valores por defecto de la aplicacion', () => {
    const variables = validarEntorno(entornoValido);

    expect(variables.NODE_ENV).toBe(Entorno.Desarrollo);
    expect(variables.PORT).toBe(3001);
    expect(variables.FRONTEND_URL).toBe('http://localhost:3000');
  });

  it.each([
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'GOOGLE_MAPS_API_KEY',
    'GEMINI_API_KEY',
  ])('falla si falta %s', (clave) => {
    const entorno = { ...entornoValido };
    delete entorno[clave as keyof typeof entorno];

    expect(() => validarEntorno(entorno)).toThrow(clave);
  });

  it('rechaza una DATABASE_URL que no sea postgresql://', () => {
    expect(() =>
      validarEntorno({
        ...entornoValido,
        DATABASE_URL: 'mysql://localhost/db',
      }),
    ).toThrow('DATABASE_URL');
  });

  it('rechaza un JWT_ACCESS_SECRET más corto que 32 caracteres', () => {
    expect(() =>
      validarEntorno({ ...entornoValido, JWT_ACCESS_SECRET: 'corto' }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('rechaza usar el mismo secreto para access y refresh', () => {
    expect(() =>
      validarEntorno({
        ...entornoValido,
        JWT_REFRESH_SECRET: entornoValido.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/deben ser secretos distintos/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() =>
      validarEntorno({ ...entornoValido, NODE_ENV: 'staging' }),
    ).toThrow('NODE_ENV');
  });

  it('rechaza un PORT fuera de rango', () => {
    expect(() => validarEntorno({ ...entornoValido, PORT: '70000' })).toThrow(
      'PORT',
    );
  });

  it('trata una clave vacía como ausente', () => {
    // `.env.example` lista las claves sin valor: un `cp .env.example .env` deja
    // las opcionales en string vacío y la app tiene que arrancar igual.
    const variables = validarEntorno({
      ...entornoValido,
      NODE_ENV: '',
      PORT: '',
    });

    expect(variables.NODE_ENV).toBe(Entorno.Desarrollo);
    expect(variables.PORT).toBe(3001);
  });

  it('rechaza una FRONTEND_URL sin protocolo', () => {
    expect(() =>
      validarEntorno({ ...entornoValido, FRONTEND_URL: 'localhost:3000' }),
    ).toThrow('FRONTEND_URL');
  });

  it('acepta un origen HTTPS configurable para el frontend', () => {
    const variables = validarEntorno({
      ...entornoValido,
      FRONTEND_URL: 'https://smartplan.example.com',
    });

    expect(variables.FRONTEND_URL).toBe('https://smartplan.example.com');
  });

  // Una barra final o una ruta pasan `@IsUrl` pero no sirven como origen: el
  // navegador compara el `Access-Control-Allow-Origin` carácter por carácter.
  // Sin esta validación la aplicación arranca y después bloquea todo el
  // frontend con un error de CORS que no explica la causa.
  it.each([
    ['con barra final', 'https://smartplan.example.com/'],
    ['con una ruta', 'https://smartplan.example.com/app'],
  ])('rechaza una FRONTEND_URL %s', (_caso, valor) => {
    expect(() =>
      validarEntorno({ ...entornoValido, FRONTEND_URL: valor }),
    ).toThrow('FRONTEND_URL');
  });

  describe('formas de configurar la conexión', () => {
    const sinConexion = {
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      RESEND_API_KEY: 're_prueba',
      EMAIL_FROM: 'no-reply@smartplan.test',
      GOOGLE_MAPS_API_KEY: 'clave-de-google-maps',
      GEMINI_API_KEY: 'clave-de-gemini',
    };

    const variablesSueltas = {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USER: 'smartplan',
      DB_PASSWORD: 'smartplan',
      DB_NAME: 'smartplan',
    };

    it('acepta las DB_* sueltas en lugar de DATABASE_URL', () => {
      const variables = validarEntorno({ ...sinConexion, ...variablesSueltas });

      expect(variables.DATABASE_URL).toBeUndefined();
      expect(variables.DB_HOST).toBe('localhost');
      expect(variables.DB_PORT).toBe(5433);
    });

    it('aplica 5432 como DB_PORT por defecto', () => {
      const sinPuerto = { ...variablesSueltas };
      delete (sinPuerto as Partial<typeof variablesSueltas>).DB_PORT;

      const variables = validarEntorno({ ...sinConexion, ...sinPuerto });

      expect(variables.DB_PORT).toBe(5432);
    });

    it('falla si no hay ninguna de las dos formas', () => {
      expect(() => validarEntorno(sinConexion)).toThrow(
        /DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/,
      );
    });

    it('falla si las DB_* están incompletas', () => {
      expect(() =>
        validarEntorno({ ...sinConexion, DB_HOST: 'localhost' }),
      ).toThrow(/DB_USER, DB_PASSWORD, DB_NAME/);
    });

    it('rechaza un DB_PORT fuera de rango', () => {
      expect(() =>
        validarEntorno({ ...sinConexion, ...variablesSueltas, DB_PORT: '0' }),
      ).toThrow('DB_PORT');
    });
  });

  it('no incluye el valor del secreto en el mensaje de error', () => {
    const secreto = 'secreto-que-no-debe-aparecer';

    expect(() =>
      validarEntorno({ ...entornoValido, JWT_ACCESS_SECRET: secreto }),
    ).toThrow(expect.not.stringContaining(secreto) as unknown as string);
  });

  // F12 — las claves de RabbitMQ viven en VariablesEntornoComunes, heredada
  // por VariablesEntorno. Cobertura mínima acá: suficiente para detectar si
  // se rompe el `extends`. La matriz completa de decoradores vive en
  // variables-entorno-worker.spec.ts, que es el esquema que realmente
  // depende de estas claves para arrancar sin nada más.
  describe('RabbitMQ', () => {
    it('aplica los valores por defecto de RabbitMQ', () => {
      const variables = validarEntorno(entornoValido);

      expect(variables.RABBITMQ_URL).toBe(
        'amqp://smartplan:smartplan@localhost:5672',
      );
      expect(variables.RABBITMQ_PREFETCH).toBe(1);
      expect(variables.RABBITMQ_MAX_INTENTOS).toBe(3);
      expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
    });

    it('rechaza una RABBITMQ_URL que no sea amqp:// ni amqps://', () => {
      expect(() =>
        validarEntorno({ ...entornoValido, RABBITMQ_URL: 'http://localhost' }),
      ).toThrow('RABBITMQ_URL');
    });

    it('rechaza reintentos incoherentes con RABBITMQ_MAX_INTENTOS (faltan demoras)', () => {
      expect(() =>
        validarEntorno({
          ...entornoValido,
          RABBITMQ_MAX_INTENTOS: '3',
          RABBITMQ_RETRY_DELAYS_MS: '5000',
        }),
      ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
    });

    it('rechaza más intentos que demoras configuradas (colas de retry insuficientes)', () => {
      // Regresión del hallazgo de code review: con la validación anterior
      // (`>=` en vez de `===`), RABBITMQ_MAX_INTENTOS=4 con solo 2 demoras
      // pasaba la validación. mensajeria.config.ts declara exactamente una
      // cola de retry por demora (acá, 2), así que el cuarto intento
      // republicaba a una routing key ("*.retry.3") sin cola/binding — en
      // un exchange direct esa publicación se confirma igual y el trabajo
      // desaparecía en silencio en vez de terminar en la DLQ.
      expect(() =>
        validarEntorno({
          ...entornoValido,
          RABBITMQ_MAX_INTENTOS: '4',
          RABBITMQ_RETRY_DELAYS_MS: '5000,30000',
        }),
      ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
    });
  });
});
