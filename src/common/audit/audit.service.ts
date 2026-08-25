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
 * a future change to the audit contract (e.g. adding an actor, populating
 * `original`) happens in one place.
 */
@Injectable()
export class AuditService {
  async record(
    manager: EntityManager,
    action: AuditAction,
    affectedEntity: string,
    affectedEntityId: number,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    await manager.save(
      manager.create(AuditLog, {
        action,
        affectedEntity,
        affectedEntityId,
        original: null,
        changes,
      }),
    );
  }

  async recordUserAction(
    manager: EntityManager,
    action: AuditAction,
    idUser: number,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    await this.record(manager, action, 'user', idUser, changes);
  }
}
