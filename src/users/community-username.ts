import { ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EntityManager, QueryFailedError, Raw } from 'typeorm';
import { User } from './entities/user.entity';

const RESERVED_NAMES = new Set([
  'admin',
  'administrator',
  'smartplan',
  'support',
  'soporte',
  'system',
  'moderator',
  'moderacion',
  'root',
  'api',
  'viajero',
]);

/** Generated identities cannot be claimed by editing another account. */
export function isReservedUsername(username: string): boolean {
  return (
    RESERVED_NAMES.has(username) ||
    /^viajero\d+(?:_[a-f0-9]{6})?$/.test(username)
  );
}

export async function generateCommunityUsername(
  manager: EntityManager,
  idUser: number,
): Promise<string> {
  const base = `viajero${idUser}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base}_${randomBytes(3).toString('hex')}`;
    const existing = await manager.findOne(User, {
      where: {
        username: Raw((column) => `LOWER(${column}) = :candidate`, {
          candidate,
        }),
      },
    });
    if (!existing) return candidate;
  }
  throw new ServiceUnavailableException({
    code: 'USERNAME_GENERATION_UNAVAILABLE',
    message: 'No pudimos asignar tu nombre público. Intentá nuevamente.',
  });
}

export function isUniqueConstraint(
  error: unknown,
  constraint: string,
): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver = error.driverError as { code?: string; constraint?: string };
  return driver.code === '23505' && driver.constraint === constraint;
}
