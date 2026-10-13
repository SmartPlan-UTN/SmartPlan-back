import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Plan, PlanKind, PlanVisibility } from '../plans/entities/plan.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { Permission } from '../users/entities/permission.entity';
import { RolePermission } from '../users/entities/role-permission.entity';
import { Role } from '../users/entities/role.entity';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { FeedbackStatus } from '../recommendation/entities/feedback-status.entity';
import { User } from '../users/entities/user.entity';
import { AdministrationService } from './administration.service';
import { UserStatusKey } from './dto/admin-list-query.dto';
import {
  ListAdminPlansQueryDto,
  ListAdminRolesQueryDto,
} from './dto/admin-list-query.dto';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './entities/audit-log.entity';
import { ExportMetricsQueryDto } from './dto/export-metrics-query.dto';
import { AdministrationMetricsDto } from './dto/administration-response.dto';

describe('AdministrationService', () => {
  let service: AdministrationService;
  const auditRecord = jest.fn();
  const exportManager = {};

  beforeEach(() => {
    service = new AdministrationService(
      {
        transaction: async (
          callback: (manager: typeof exportManager) => Promise<void>,
        ) => callback(exportManager),
      } as unknown as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      {} as Repository<Plan>,
      {} as Repository<Rating>,
      {} as Repository<Permission>,
      {} as Repository<Role>,
      {} as Repository<RolePermission>,
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      { record: auditRecord } as never,
      {} as never,
    );
  });

  describe('dashboard export (CU58)', () => {
    const metrics: AdministrationMetricsDto = {
      range: {
        key: '30d',
        from: new Date('2026-09-12T12:00:00Z'),
        to: new Date('2026-10-12T12:00:00Z'),
      },
      kpis: {
        totalUsers: 1,
        activePlans: 0,
        catalogActivities: 0,
        openReports: 0,
      },
      acceptanceRate: 0,
      averageRating: 0,
      retentionRate: 0,
      distributions: { moods: [], groupSizes: [] },
      popularActivities: [],
      recentActivity: [],
    };

    it('calculates once and records the actor and window before returning the file', async () => {
      const calculate = jest
        .spyOn(service, 'metrics')
        .mockResolvedValue(metrics);
      const query = new ExportMetricsQueryDto();
      const report = await service.exportMetrics(7, query);
      expect(calculate).toHaveBeenCalledTimes(1);
      expect(calculate).toHaveBeenCalledWith(query);
      expect(report.filename).toBe('smartplan-metricas-30d-2026-10-12.csv');
      expect(report.buffer.toString()).toContain('"Total de Usuarios";1');
      expect(auditRecord).toHaveBeenCalledWith(
        exportManager,
        AuditAction.Export,
        'user',
        7,
        {
          report: 'dashboard-metrics',
          range: '30d',
          format: 'csv',
          from: metrics.range.from.toISOString(),
          to: metrics.range.to.toISOString(),
          generatedAt: metrics.range.to.toISOString(),
        },
        7,
      );
    });

    it('does not return a file when audit persistence fails', async () => {
      jest.spyOn(service, 'metrics').mockResolvedValue(metrics);
      auditRecord.mockRejectedValueOnce(new Error('audit unavailable'));
      await expect(
        service.exportMetrics(7, new ExportMetricsQueryDto()),
      ).rejects.toThrow('audit unavailable');
    });

    it('does not audit a report whose calculation failed', async () => {
      jest
        .spyOn(service, 'metrics')
        .mockRejectedValue(new Error('calculation failed'));
      await expect(
        service.exportMetrics(7, new ExportMetricsQueryDto()),
      ).rejects.toThrow('calculation failed');
      expect(auditRecord).not.toHaveBeenCalled();
    });
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
    await expect(service.updateActivity(5, 1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty plan update (CU60)', async () => {
    await expect(service.updatePlan(5, 1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('filters plans by kind and visibility and says whether Explorar lists them (#160)', async () => {
    const query = Object.assign(new ListAdminPlansQueryDto(), {
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Public,
    });
    const andWhere = jest.fn().mockReturnThis();
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      andWhere,
      select: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '2' }),
      getRawMany: jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]),
    };
    const base = {
      title: 'Plan',
      description: null,
      estimatedTotalCost: 0,
      estimatedTotalDuration: 0,
      peopleCount: 2,
      details: [],
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Public,
      user: { id: 3, name: 'Ana', lastName: 'Pérez', email: 'ana@example.com' },
    };
    const plans = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      find: jest.fn().mockResolvedValue([
        { ...base, id: 1, status: { key: 'completed', name: 'Completado' } },
        { ...base, id: 2, status: { key: 'cancelled', name: 'Cancelado' } },
      ]),
    };
    service = new AdministrationService(
      {} as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      plans as never,
      {} as Repository<Rating>,
      {} as Repository<Permission>,
      {} as Repository<Role>,
      {} as Repository<RolePermission>,
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      {} as never,
    );

    const result = await service.listPlans(query);

    expect(andWhere).toHaveBeenCalledWith('plan.kind = :kind', {
      kind: PlanKind.Authored,
    });
    expect(andWhere).toHaveBeenCalledWith('plan.visibility = :visibility', {
      visibility: PlanVisibility.Public,
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 1,
        kind: PlanKind.Authored,
        visibility: PlanVisibility.Public,
        listedInExplore: true,
        exploreHiddenCause: null,
      }),
      expect.objectContaining({
        id: 2,
        listedInExplore: false,
        exploreHiddenCause: 'cancelled',
      }),
    ]);
  });

  it('lists roles without requiring permission assignments (CU62)', async () => {
    const query = new ListAdminRolesQueryDto();
    const roles = [
      { id: 2, key: 'user', name: 'User', description: null } as Role,
    ];
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([roles, 1]),
    };
    service = new AdministrationService(
      {} as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      {} as Repository<Plan>,
      {} as Repository<Rating>,
      {} as Repository<Permission>,
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
      {} as Repository<RolePermission>,
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      {} as never,
      {} as never,
    );

    await expect(service.listRoles(query)).resolves.toMatchObject({
      data: [{ id: 2, key: 'user' }],
      pagination: { total: 1 },
    });
  });

  it('creates a custom role and audits its immutable key (CU62)', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_: unknown, value: Record<string, unknown>) => ({
        id: 9,
        ...value,
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
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      auditService as never,
      {} as never,
    );

    await expect(
      service.createRole(7, { key: 'event-host', name: 'Event host' }),
    ).resolves.toMatchObject({ id: 9, key: 'event-host' });
    expect(auditService.record).toHaveBeenCalledWith(
      manager,
      'create',
      'role',
      9,
      { key: 'event-host' },
      7,
    );
  });

  it('rejects a system role update (CU62)', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        key: 'admin',
        name: 'Administrator',
      } as Role),
    };
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
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateRole(7, 1, { name: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects deletion when users are assigned to a role (CU62)', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 9,
        key: 'event-host',
        name: 'Event host',
      } as Role),
      count: jest.fn().mockResolvedValue(1),
    };
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
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      {} as never,
      {} as never,
    );

    await expect(service.removeRole(7, 9)).rejects.toBeInstanceOf(
      ConflictException,
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
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      auditService as never,
      {} as never,
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

  it('reviews feedback once and records the administrator (CU59)', async () => {
    const feedback = {
      id: 9,
      rating: 4,
      tags: ['great_value'],
      comment: 'Great experience',
      actualCost: 12,
      actualDuration: 90,
      status: { id: 1, key: 'pending', name: 'Pending' },
      plan: {
        id: 4,
        title: 'Afternoon plan',
        user: {
          id: 3,
          name: 'Test',
          lastName: 'User',
          email: 'test@example.com',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Feedback;
    const processed = {
      id: 2,
      key: 'processed',
      name: 'Processed',
    } as FeedbackStatus;
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(feedback)
        .mockResolvedValueOnce(feedback)
        .mockResolvedValueOnce(processed),
      save: jest.fn().mockResolvedValue(feedback),
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
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      auditService as never,
      {} as never,
    );

    await expect(
      service.reviewFeedback(7, 9, {
        status: 'processed',
        note: 'Useful for future plans.',
      }),
    ).resolves.toMatchObject({ id: 9, status: { key: 'processed' } });
    expect(manager.findOne).toHaveBeenNthCalledWith(1, Feedback, {
      where: { id: 9 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.save).toHaveBeenCalledWith(feedback);
    expect(auditService.record).toHaveBeenCalledWith(
      manager,
      'update',
      'feedback',
      9,
      { from: 'pending', to: 'processed', note: 'Useful for future plans.' },
      7,
    );
  });
});
