import { EntityManager } from 'typeorm';
import {
  AuditAction,
  AuditLog,
} from '../../administration/entities/audit-log.entity';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const service = new AuditService();
  let manager: { create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    manager = {
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
  });

  it('stores the actor responsible for the operation', async () => {
    await service.record(
      manager as unknown as EntityManager,
      AuditAction.Delete,
      'activity',
      3,
      null,
      7,
    );

    expect(manager.create).toHaveBeenCalledWith(AuditLog, {
      action: AuditAction.Delete,
      idActor: 7,
      affectedEntity: 'activity',
      affectedEntityId: 3,
      original: null,
      changes: null,
    });
  });

  it('records the user as the actor of their own account operations', async () => {
    await service.recordUserAction(
      manager as unknown as EntityManager,
      AuditAction.StartSession,
      12,
      null,
    );

    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        idActor: 12,
        affectedEntity: 'user',
        affectedEntityId: 12,
      }),
    );
  });
});
