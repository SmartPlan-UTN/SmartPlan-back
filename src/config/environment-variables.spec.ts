import {
  EmailTransport,
  Environment,
  validateEnvironment,
  EnvironmentVariables,
} from './environment-variables';

const validEnvironment = {
  DATABASE_URL: 'postgresql://smartplan:key@localhost:5432/smartplan',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'not-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'key-of-google-maps',
  GEMINI_API_KEY: 'key-of-gemini',
};

describe('validateEnvironment', () => {
  it('accepts a environment complete and returns the variables typed', () => {
    const variables = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      PORT: '8080',
    });

    expect(variables).toBeInstanceOf(EnvironmentVariables);
    expect(variables.NODE_ENV).toBe(Environment.Production);
    expect(variables.DATABASE_URL).toBe(validEnvironment.DATABASE_URL);
  });

  it('converts PORT to a number', () => {
    const variables = validateEnvironment({
      ...validEnvironment,
      PORT: '8080',
    });

    expect(variables.PORT).toBe(8080);
  });

  it('applies the values by default of the appliescion', () => {
    const variables = validateEnvironment(validEnvironment);

    expect(variables.NODE_ENV).toBe(Environment.Development);
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
  ])('fails if is missing %s', (key) => {
    const environment = { ...validEnvironment };
    delete environment[key as keyof typeof environment];

    expect(() => validateEnvironment(environment)).toThrow(key);
  });

  it('rejects a DATABASE_URL that is not postgresql://', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'mysql://localhost/db',
      }),
    ).toThrow('DATABASE_URL');
  });

  it('rejects a JWT_ACCESS_SECRET more corto that 32 characters', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('rejects a NODE_ENV unknown', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, NODE_ENV: 'staging' }),
    ).toThrow('NODE_ENV');
  });

  it('rejects a PORT outside of range', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrow('PORT');
  });

  it('treats an empty key as absent', () => {
    const variables = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: '',
      PORT: '',
    });

    expect(variables.NODE_ENV).toBe(Environment.Development);
    expect(variables.PORT).toBe(3001);
  });

  it('rejects a FRONTEND_URL without protocol', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        FRONTEND_URL: 'localhost:3000',
      }),
    ).toThrow('FRONTEND_URL');
  });

  it('accepts a origin HTTPS configurable for the frontend', () => {
    const variables = validateEnvironment({
      ...validEnvironment,
      FRONTEND_URL: 'https://smartplan.example.com',
    });

    expect(variables.FRONTEND_URL).toBe('https://smartplan.example.com');
  });

  it.each([
    ['with a trailing slash', 'https://smartplan.example.com/'],
    ['with a route', 'https://smartplan.example.com/app'],
  ])('rejects a FRONTEND_URL %s', (_caseName, value) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, FRONTEND_URL: value }),
    ).toThrow('FRONTEND_URL');
  });

  describe('connection configuration methods', () => {
    const withoutConnection = {
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'not-reply@smartplan.test',
      GOOGLE_MAPS_API_KEY: 'key-of-google-maps',
      GEMINI_API_KEY: 'key-of-gemini',
    };

    const individualVariables = {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USER: 'smartplan',
      DB_PASSWORD: 'smartplan',
      DB_NAME: 'smartplan',
    };

    it('accepts the DB_* individual in place of DATABASE_URL', () => {
      const variables = validateEnvironment({
        ...withoutConnection,
        ...individualVariables,
      });

      expect(variables.DATABASE_URL).toBeUndefined();
      expect(variables.DB_HOST).toBe('localhost');
      expect(variables.DB_PORT).toBe(5433);
    });

    it('applies 5432 as DB_PORT by default', () => {
      const withoutPort = { ...individualVariables };
      delete (withoutPort as Partial<typeof individualVariables>).DB_PORT;

      const variables = validateEnvironment({
        ...withoutConnection,
        ...withoutPort,
      });

      expect(variables.DB_PORT).toBe(5432);
    });

    it('fails if neither database configuration form is present', () => {
      expect(() => validateEnvironment(withoutConnection)).toThrow(
        /DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/,
      );
    });

    it('fails if the DB_* isn incomplete', () => {
      expect(() =>
        validateEnvironment({ ...withoutConnection, DB_HOST: 'localhost' }),
      ).toThrow(/DB_USER, DB_PASSWORD, DB_NAME/);
    });

    it('rejects a DB_PORT outside of range', () => {
      expect(() =>
        validateEnvironment({
          ...withoutConnection,
          ...individualVariables,
          DB_PORT: '0',
        }),
      ).toThrow('DB_PORT');
    });
  });

  it('does not include the secret value in the error message', () => {
    const secret = 'secret-that-must-not-appear';

    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_ACCESS_SECRET: secret }),
    ).toThrow(expect.not.stringContaining(secret) as unknown as string);
  });

  describe('RabbitMQ', () => {
    it('applies the values by default of RabbitMQ', () => {
      const variables = validateEnvironment(validEnvironment);

      expect(variables.RABBITMQ_URL).toBe(
        'amqp://smartplan:smartplan@localhost:5672',
      );
      expect(variables.RABBITMQ_PREFETCH).toBe(1);
      expect(variables.RABBITMQ_MAX_ATTEMPTS).toBe(3);
      expect(variables.RABBITMQ_RETRY_DELAYS_MS).toBe('5000,30000');
    });

    it('rejects a RABBITMQ_URL that is neither amqp:// nor amqps://', () => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          RABBITMQ_URL: 'http://localhost',
        }),
      ).toThrow('RABBITMQ_URL');
    });

    it('rejects reattempts inconsistent with RABBITMQ_MAX_ATTEMPTS (missing delays)', () => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          RABBITMQ_MAX_ATTEMPTS: '3',
          RABBITMQ_RETRY_DELAYS_MS: '5000',
        }),
      ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
    });

    it('rejects more attempts that delays configuradas (queues of retry insufficient)', () => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          RABBITMQ_MAX_ATTEMPTS: '4',
          RABBITMQ_RETRY_DELAYS_MS: '5000,30000',
        }),
      ).toThrow('RABBITMQ_RETRY_DELAYS_MS');
    });
  });

  describe('email transport', () => {
    /** Everything except the provider credentials. */
    const withoutKey = { ...validEnvironment, RESEND_API_KEY: undefined };

    it('sends through the provider unless told otherwise', () => {
      expect(validateEnvironment(validEnvironment).EMAIL_TRANSPORT).toBe(
        EmailTransport.Resend,
      );
    });

    it('rejects a transport it does not implement', () => {
      expect(() =>
        validateEnvironment({ ...validEnvironment, EMAIL_TRANSPORT: 'smtp' }),
      ).toThrow('EMAIL_TRANSPORT');
    });

    /**
     * The whole point of the log transport: a developer with no provider
     * account can still reach the reset screen.
     */
    it('boots without a provider key when the transport is log', () => {
      const variables = validateEnvironment({
        ...withoutKey,
        EMAIL_TRANSPORT: 'log',
      });

      expect(variables.EMAIL_TRANSPORT).toBe(EmailTransport.Log);
      expect(variables.RESEND_API_KEY).toBeUndefined();
    });

    it('refuses the provider transport without a key, naming the way out', () => {
      expect(() => validateEnvironment(withoutKey)).toThrow('RESEND_API_KEY');
      expect(() => validateEnvironment(withoutKey)).toThrow(
        'EMAIL_TRANSPORT=log',
      );
    });

    /**
     * The log transport prints single-use recovery links in clear text.
     * Deployed, that is an account takeover for anyone who can read the
     * log, so it has to fail at boot rather than at the first reset.
     */
    it('refuses the log transport in production', () => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          NODE_ENV: 'production',
          EMAIL_TRANSPORT: 'log',
        }),
      ).toThrow('production');
    });
  });
});
