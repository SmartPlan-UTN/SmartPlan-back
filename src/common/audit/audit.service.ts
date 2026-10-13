import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../../administration/entities/audit-log.entity';

/**
 * Records an audit entry within an existing transaction.
 *
 * Extracted from the identical private `audit()` helper that `AuthService`
 * and `UsersService` each had (same shape: `original: null`, `changes`), so
 * a future change to the audit contract (e.g. populating `original`)
 * happens in one place.
 *
 * `actorId` is required so every caller states who performed the operation;
 * pass `null` only for operations without an authenticated user.
 */
@Injectable()
export class AuditService {
  async record(
    manager: EntityManager,
    action: AuditAction,
    affectedEntity: string,
    affectedEntityId: number,
    changes: Record<string, unknown> | null,
    actorId: number | null,
  ): Promise<void> {
    await manager.save(
      manager.create(AuditLog, {
        action,
        idActor: actorId,
        affectedEntity,
        affectedEntityId,
        original: null,
        changes,
      }),
    );
  }

  /** Records an operation a user performed on their own account. */
  async recordUserAction(
    manager: EntityManager,
    action: AuditAction,
    idUser: number,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    await this.record(manager, action, 'user', idUser, changes, idUser);
  }
}
