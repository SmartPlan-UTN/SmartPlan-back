import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Plan } from '../plans/entities/plan.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { Permission } from '../users/entities/permission.entity';
import { RolePermission } from '../users/entities/role-permission.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { AdministrationService } from './administration.service';
import { UserStatusKey } from './dto/admin-list-query.dto';
import { AuditLog } from './entities/audit-log.entity';

describe('AdministrationService', () => {
  let service: AdministrationService;

  beforeEach(() => {
    service = new AdministrationService(
      {} as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      {} as Repository<Plan>,
      {} as Repository<Rating>,
      {} as Repository<Permission>,
      {} as Repository<Role>,
      {} as Repository<RolePermission>,
      {} as Repository<AuditLog>,
      {} as never,
    );
  });

  it('rejects an administrator who suspends their own account (CU57)', async () => {
    await expect(
      service.changeUserStatus(5, 5, {
        status: UserStatusKey.SUSPENDED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an empty user update (CU57)', async () => {
    await expect(service.updateUser(5, 7, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty activity update (CU53)', async () => {
    await expect(service.updateActivity(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty plan update (CU60)', async () => {
    await expect(service.updatePlan(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates a permission and grants it to the administrator (CU61)', async () => {
    const administrator = {
      id: 1,
      key: 'admin',
      name: 'Administrator',
    } as Role;
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(administrator),
      create: jest.fn((target: unknown, value: Record<string, unknown>) => ({
        ...value,
        id: target === Permission ? 9 : 10,
      })),
      save: jest.fn((value: unknown) => value),
    };
    const auditService = { record: jest.fn() };
    service = new AdministrationService(
      {
        transaction: (callback: (entityManager: typeof manager) => unknown) =>
          callback(manager),
      } as unknown as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      {} as Repository<Plan>,
      {} as Repository<Rating>,
      {} as Repository<Permission>,
      {} as Repository<Role>,
      {} as Repository<RolePermission>,
      {} as Repository<AuditLog>,
      auditService as never,
    );

    await expect(
      service.createPermission(7, {
        key: 'collection.share',
        name: 'Share collections',
      }),
    ).resolves.toMatchObject({
      id: 9,
      key: 'collection.share',
      roles: [{ id: 1, key: 'admin' }],
    });
    expect(auditService.record).toHaveBeenCalledWith(
      manager,
      'create',
      'permission',
      9,
      { key: 'collection.share', assignedRoleIds: [1] },
      7,
    );
  });
});
