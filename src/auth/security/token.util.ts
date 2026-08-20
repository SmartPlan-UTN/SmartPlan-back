import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashesMatch(esperado: string, recibido: string): boolean {
  const a = Buffer.from(esperado, 'hex');
  const b = Buffer.from(recibido, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
