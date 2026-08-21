import { createOpaqueToken, hashToken, hashesMatch } from './token.util';

describe('utilidades of token', () => {
  it('generates random tokens and compares only their hashes', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).not.toBe(second);
    expect(hashToken(first)).not.toContain(first);
    expect(hashesMatch(hashToken(first), hashToken(first))).toBe(true);
    expect(hashesMatch(hashToken(first), hashToken(second))).toBe(false);
  });
});
