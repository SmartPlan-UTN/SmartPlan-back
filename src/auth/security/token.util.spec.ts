import { createOpaqueToken, hashToken, hashesMatch } from './token.util';

describe('utilidades de token', () => {
  it('genera tokens aleatorios y solo compara sus hashes', () => {
    const primero = createOpaqueToken();
    const segundo = createOpaqueToken();

    expect(primero).not.toBe(segundo);
    expect(hashToken(primero)).not.toContain(primero);
    expect(hashesMatch(hashToken(primero), hashToken(primero))).toBe(true);
    expect(hashesMatch(hashToken(primero), hashToken(segundo))).toBe(false);
  });
});
