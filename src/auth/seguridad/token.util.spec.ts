import { crearTokenOpaco, hashearToken, hashesCoinciden } from './token.util';

describe('utilidades de token', () => {
  it('genera tokens aleatorios y solo compara sus hashes', () => {
    const primero = crearTokenOpaco();
    const segundo = crearTokenOpaco();

    expect(primero).not.toBe(segundo);
    expect(hashearToken(primero)).not.toContain(primero);
    expect(hashesCoinciden(hashearToken(primero), hashearToken(primero))).toBe(
      true,
    );
    expect(hashesCoinciden(hashearToken(primero), hashearToken(segundo))).toBe(
      false,
    );
  });
});
