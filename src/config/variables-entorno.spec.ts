import { Entorno, validarEntorno, VariablesEntorno } from './variables-entorno';

/** Entorno mínimo válido. Cada test parte de acá y rompe una sola cosa. */
const entornoValido = {
  DATABASE_URL: 'postgresql://smartplan:clave@localhost:5432/smartplan',
  JWT_SECRET: 'a'.repeat(32),
  GOOGLE_MAPS_API_KEY: 'clave-de-google-maps',
  OPENAI_API_KEY: 'clave-de-openai',
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

  it('aplica los valores por defecto de NODE_ENV y PORT', () => {
    const variables = validarEntorno(entornoValido);

    expect(variables.NODE_ENV).toBe(Entorno.Desarrollo);
    expect(variables.PORT).toBe(3000);
  });

  it.each([
    'DATABASE_URL',
    'JWT_SECRET',
    'GOOGLE_MAPS_API_KEY',
    'OPENAI_API_KEY',
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

  it('rechaza un JWT_SECRET más corto que 32 caracteres', () => {
    expect(() =>
      validarEntorno({ ...entornoValido, JWT_SECRET: 'corto' }),
    ).toThrow('JWT_SECRET');
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

  it('no incluye el valor del secreto en el mensaje de error', () => {
    const secreto = 'secreto-que-no-debe-aparecer';

    expect(() =>
      validarEntorno({ ...entornoValido, JWT_SECRET: secreto }),
    ).toThrow(expect.not.stringContaining(secreto) as unknown as string);
  });
});
