import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../../administration/entities/audit-log.entity';

/**
 * Records a `user` audit entry within an existing transaction.
 *
 * Extracted from the identical private `audit()` helper that `AuthService`
 * and `UsersService` each had (same shape: `affectedEntity: 'user'`,
 * `original: null`, `changes`), so a future change to the audit contract
 * (e.g. adding an actor, populating `original`) happens in one place.
 */
@Injectable()
export class AuditService {
  async recordUserAction(
    manager: EntityManager,
    action: AuditAction,
    idUser: number,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    await manager.save(
      manager.create(AuditLog, {
        action,
        affectedEntity: 'user',
        affectedEntityId: idUser,
        original: null,
        changes,
      }),
    );
  }
}
