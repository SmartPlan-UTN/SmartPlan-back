import {
  DataSource,
  EntityManager,
  EntityTarget,
  In,
  Repository,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { CategoryStatus } from '../../categories/entities/category-status.entity';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { PlanStatus } from '../../plans/entities/plan-status.entity';
import { FeedbackStatus } from '../../recommendation/entities/feedback-status.entity';
import { RequestStatus } from '../../recommendation/entities/request-status.entity';
import { OutingType } from '../../recommendation/entities/outing-type.entity';
import { UserStatus } from '../../users/entities/user-status.entity';
import { Permission } from '../../users/entities/permission.entity';
import { RolePermission } from '../../users/entities/role-permission.entity';
import { Role } from '../../users/entities/role.entity';
import {
  CATEGORIES,
  INITIAL_CATEGORY_STATUS,
  CATEGORY_STATUSES,
  EXTERNAL_PROVIDERS,
  PLAN_STATUSES,
  FEEDBACK_STATUSES,
  REQUEST_STATUSES,
  OUTING_TYPES,
  USER_STATUSES,
  PERMISSIONS,
  ROLES,
  CatalogValue,
} from './definitions';

export interface TableSummary {
  table: string;
  created: number;
  existing: number;
}

export async function seedInitialData(
  dataSource: DataSource,
): Promise<TableSummary[]> {
  return dataSource.transaction(async (manager) => {
    const summary: TableSummary[] = [];

    summary.push(await seedCatalog(manager, Role, ROLES));
    summary.push(await seedCatalog(manager, Permission, PERMISSIONS));
    summary.push(await seedCatalog(manager, UserStatus, USER_STATUSES));
    summary.push(await seedCatalog(manager, PlanStatus, PLAN_STATUSES));
    summary.push(await seedCatalog(manager, CategoryStatus, CATEGORY_STATUSES));
    summary.push(await seedCatalog(manager, FeedbackStatus, FEEDBACK_STATUSES));
    summary.push(await seedCatalog(manager, RequestStatus, REQUEST_STATUSES));
    summary.push(await seedCatalog(manager, OutingType, OUTING_TYPES));
    summary.push(
      await seedCatalog(manager, ExternalProvider, EXTERNAL_PROVIDERS),
    );
    summary.push(await seedRolePermissions(manager));
    summary.push(await seedCategories(manager));

    return summary;
  });
}

async function seedCatalog(
  manager: EntityManager,
  entity: EntityTarget<CatalogEntity>,
  values: readonly CatalogValue[],
): Promise<TableSummary> {
  const repository = manager.getRepository(entity);

  const rows = await repository.find({
    where: { key: In(values.map((value) => value.key)) },
    select: { key: true },
    withDeleted: true,
  });
  const existingKeys = new Set(rows.map((row) => row.key));

  const missing = values.filter((value) => !existingKeys.has(value.key));
  if (missing.length > 0) {
    await repository.save(repository.create(missing));
  }

  return {
    table: repository.metadata.tableName,
    created: missing.length,
    existing: values.length - missing.length,
  };
}

async function seedRolePermissions(
  manager: EntityManager,
): Promise<TableSummary> {
  const roleIds = await mapIdsByKey(manager.getRepository(Role));
  const permissionIds = await mapIdsByKey(manager.getRepository(Permission));

  const assignments = PERMISSIONS.flatMap((permission) =>
    permission.roles.map((role) => ({
      idRole: requireId(roleIds, role, 'role'),
      idPermission: requireId(permissionIds, permission.key, 'permission'),
    })),
  );

  const repository = manager.getRepository(RolePermission);
  const rows = await repository.find({
    select: { idRole: true, idPermission: true },
    withDeleted: true,
  });
  const existingKeys = new Set(rows.map(toPair));

  const missing = assignments.filter(
    (assignment) => !existingKeys.has(toPair(assignment)),
  );
  if (missing.length > 0) {
    await repository.save(repository.create(missing));
  }

  return {
    table: repository.metadata.tableName,
    created: missing.length,
    existing: assignments.length - missing.length,
  };
}

async function seedCategories(manager: EntityManager): Promise<TableSummary> {
  const statuses = manager.getRepository(CategoryStatus);
  const initialStatus = await statuses.findOne({
    where: { key: INITIAL_CATEGORY_STATUS },
    withDeleted: true,
    order: { id: 'DESC' },
  });

  if (!initialStatus) {
    throw new Error(
      `Falta the status of category "${INITIAL_CATEGORY_STATUS}": the ` +
        `categories cannot be seeded before their statuses.`,
    );
  }

  const repository = manager.getRepository(Category);
  const rows = await repository.find({
    where: { name: In(CATEGORIES.map((category) => category.name)) },
    select: { name: true },
    withDeleted: true,
  });
  const existingKeys = new Set(rows.map((row) => row.name));

  const missing = CATEGORIES.filter(
    (category) => !existingKeys.has(category.name),
  ).map((category) => ({ ...category, idCategoryStatus: initialStatus.id }));

  if (missing.length > 0) {
    await repository.save(repository.create(missing));
  }

  return {
    table: repository.metadata.tableName,
    created: missing.length,
    existing: CATEGORIES.length - missing.length,
  };
}

async function mapIdsByKey(
  repository: Repository<CatalogEntity>,
): Promise<Map<string, number>> {
  const rows = await repository.find({
    select: { id: true, key: true },
    withDeleted: true,
    order: { id: 'ASC' },
  });

  return new Map(rows.map((row) => [row.key, row.id]));
}

function requireId(
  ids: Map<string, number>,
  key: string,
  table: string,
): number {
  const id = ids.get(key);

  if (id === undefined) {
    throw new Error(
      `No  ${table} with key "${key}". Verify that it is declared in ` +
        `src/database/seeds/definitions.ts.`,
    );
  }

  return id;
}

function toPair(assignment: { idRole: number; idPermission: number }): string {
  return `${assignment.idRole}:${assignment.idPermission}`;
}
