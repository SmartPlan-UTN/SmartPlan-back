import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { Category } from '../src/categories/entities/category.entity';
import { CategoryStatus } from '../src/categories/entities/category-status.entity';
import {
  CATEGORIES,
  CATEGORY_STATUSES,
  PLAN_STATUSES,
  FEEDBACK_STATUSES,
  USER_STATUSES,
  PERMISSIONS,
  ROLES,
} from '../src/database/seeds/definitions';
import { TableSummary, seedInitialData } from '../src/database/seeds/seed';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import { FeedbackStatus } from '../src/recommendation/entities/feedback-status.entity';
import { UserStatus } from '../src/users/entities/user-status.entity';
import { Permission } from '../src/users/entities/permission.entity';
import { RolePermission } from '../src/users/entities/role-permission.entity';
import { Role } from '../src/users/entities/role.entity';
import { createTestApp } from './create-test-app';

describe('Data seed (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let roles: Repository<Role>;
  let permissions: Repository<Permission>;
  let rolePermissions: Repository<RolePermission>;
  let categories: Repository<Category>;
  let categoryStatuses: Repository<CategoryStatus>;

  let seededRepositories: Map<string, Repository<ObjectLiteral>>;

  const expectedCounts: Record<string, number> = {
    role: ROLES.length,
    permission: PERMISSIONS.length,
    user_status: USER_STATUSES.length,
    plan_status: PLAN_STATUSES.length,
    category_status: CATEGORY_STATUSES.length,
    feedback_status: FEEDBACK_STATUSES.length,
    role_permission: PERMISSIONS.reduce(
      (total, permission) => total + permission.roles.length,
      0,
    ),
    category: CATEGORIES.length,
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    roles = dataSource.getRepository(Role);
    permissions = dataSource.getRepository(Permission);
    rolePermissions = dataSource.getRepository(RolePermission);
    categories = dataSource.getRepository(Category);
    categoryStatuses = dataSource.getRepository(CategoryStatus);

    seededRepositories = new Map<string, Repository<ObjectLiteral>>([
      ['role', roles],
      ['permission', permissions],
      ['user_status', dataSource.getRepository(UserStatus)],
      ['plan_status', dataSource.getRepository(PlanStatus)],
      ['category_status', categoryStatuses],
      ['feedback_status', dataSource.getRepository(FeedbackStatus)],
      ['role_permission', rolePermissions],
      ['category', categories],
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await rolePermissions.deleteAll();
    await categories.deleteAll();

    for (const [table, repository] of seededRepositories) {
      if (table !== 'role_permission' && table !== 'category') {
        await repository.deleteAll();
      }
    }
  });

  function byTable(summary: TableSummary[]): Record<string, TableSummary> {
    return Object.fromEntries(summary.map((row) => [row.table, row]));
  }

  async function countRows(): Promise<Record<string, number>> {
    const conteos: Record<string, number> = {};

    for (const [table, repository] of seededRepositories) {
      conteos[table] = await repository.count();
    }

    return conteos;
  }

  it('seeds roles, permissions, statuses, and categories into an empty database', async () => {
    const summary = byTable(await seedInitialData(dataSource));

    for (const [table, quantity] of Object.entries(expectedCounts)) {
      expect(summary[table]).toEqual({
        table,
        created: quantity,
        existing: 0,
      });
    }
    await expect(countRows()).resolves.toEqual(expectedCounts);
  });

  it('does not duplicate data when run twice', async () => {
    await seedInitialData(dataSource);
    const secondRun = byTable(await seedInitialData(dataSource));

    for (const [table, quantity] of Object.entries(expectedCounts)) {
      expect(secondRun[table]).toEqual({
        table,
        created: 0,
        existing: quantity,
      });
    }
    await expect(countRows()).resolves.toEqual(expectedCounts);
  });

  it('leaves to the admin with all the permissions and to the user with the their own (CU61)', async () => {
    await seedInitialData(dataSource);

    const grantedPermissions = async (key: string): Promise<string[]> => {
      const role = await roles.findOneByOrFail({ key: key });
      const assignments = await rolePermissions.find({
        where: { idRole: role.id },
        relations: { permission: true },
      });

      return assignments.map((assignment) => assignment.permission.key).sort();
    };

    const deUser = PERMISSIONS.filter((permission) =>
      permission.roles.includes('user'),
    ).map((permission) => permission.key);

    await expect(grantedPermissions('admin')).resolves.toEqual(
      PERMISSIONS.map((permission) => permission.key).sort(),
    );
    await expect(grantedPermissions('user')).resolves.toEqual(deUser.sort());
    await expect(grantedPermissions('user')).resolves.not.toContain(
      'user.list',
    );
  });

  it('leaves the categories initial in status active (CU54)', async () => {
    await seedInitialData(dataSource);

    const active = await categoryStatuses.findOneByOrFail({ key: 'active' });
    const creadas = await categories.find({ order: { id: 'ASC' } });

    expect(creadas.map((category) => category.name)).toEqual(
      CATEGORIES.map((category) => category.name),
    );
    for (const category of creadas) {
      expect(category.idCategoryStatus).toBe(active.id);
    }
  });

  it('does not revive a soft-deleted value', async () => {
    await seedInitialData(dataSource);

    const [first] = await categories.find({ order: { id: 'ASC' }, take: 1 });
    await categories.softRemove(first);

    const summary = byTable(await seedInitialData(dataSource));

    expect(summary.category.created).toBe(0);
    await expect(categories.count()).resolves.toBe(CATEGORIES.length - 1);
    await expect(categories.count({ withDeleted: true })).resolves.toBe(
      CATEGORIES.length,
    );
  });

  it('restores missing values without overwriting existing values', async () => {
    await seedInitialData(dataSource);

    const edited = await roles.findOneByOrFail({ key: 'user' });
    await roles.update(edited.id, { name: 'User final' });
    const otorgadas = PERMISSIONS.find(
      (permission) => permission.key === 'plan.generate',
    )!.roles.length;
    await permissions.delete({ key: 'plan.generate' });

    const summary = byTable(await seedInitialData(dataSource));

    expect(summary.permission.created).toBe(1);
    expect(summary.role.created).toBe(0);
    expect(summary.role_permission.created).toBe(otorgadas);
    await expect(countRows()).resolves.toEqual(expectedCounts);
    await expect(roles.findOneByOrFail({ key: 'user' })).resolves.toEqual(
      expect.objectContaining({ name: 'User final' }),
    );
  });
});
