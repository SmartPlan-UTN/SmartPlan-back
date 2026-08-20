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
import { PlanStatus } from '../../plans/entities/plan-status.entity';
import { FeedbackStatus } from '../../recommendation/entities/feedback-status.entity';
import { UserStatus } from '../../users/entities/user-status.entity';
import { Permission } from '../../users/entities/permission.entity';
import { RolePermission } from '../../users/entities/role-permission.entity';
import { Role } from '../../users/entities/role.entity';
import {
  CATEGORIES,
  INITIAL_CATEGORY_STATUS,
  CATEGORY_STATUSES,
  PLAN_STATUSES,
  FEEDBACK_STATUSES,
  USER_STATUSES,
  PERMISSIONS,
  ROLES,
  CatalogValue,
} from './definitions';

/**
 * Siembra de los data mínimos del sistema (F09).
 *
 * ## La regla de idempotencia
 *
 * La semilla **solo inserta lo que falta**. Nunca pisa ni revive una fila que ya
 * está, y por eso correrla dos veces no duplica nada.
 *
 * Que no pise tiene un motivo: `name` y `description` de los catálogos son
 * editables desde la administración (CU54, CU61, CU62). Si la semilla los
 * reescribiera, cada despliegue desharía el job del admin.
 *
 * Que no reviva tiene otro: la existencia se chequea **incluyendo las filas
 * dadas de baja** (`withDeleted: true`). Si alguien dio de baja una categoría,
 * fue a propósito; volver a insertarla en el próximo despliegue sería
 * desautorizarlo en silencio. Además, los índices únicos del model son
 * parciales (`WHERE deleted_at IS NULL`), así que sin ese `withDeleted` la
 * semilla insertaría una secondRun fila con la misma key sin que la base la
 * frenara.
 *
 * ## Orden
 *
 * Los catálogos van primero porque `role_permission` y `category` los referencian.
 * Todo corre dentro de una transacción: o queda sembrado el conjunto completo o
 * no queda nada, nunca una base a medio armar.
 */

/** Lo que dejó la semilla en una table. */
export interface TableSummary {
  table: string;
  creados: number;
  existentes: number;
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
    summary.push(await seedRolePermissions(manager));
    summary.push(await seedCategories(manager));

    return summary;
  });
}

/**
 * Siembra una table de catálogo. Sirve para las seis (`role`, `permission` y los
 * cuatro `status_*`) porque todas heredan de `CatalogEntity` y se identifican
 * por su `key`.
 */
async function seedCatalog(
  manager: EntityManager,
  entity: EntityTarget<CatalogEntity>,
  valores: readonly CatalogValue[],
): Promise<TableSummary> {
  const repositorio = manager.getRepository(entity);

  const filas = await repositorio.find({
    where: { key: In(valores.map((value) => value.key)) },
    select: { key: true },
    withDeleted: true,
  });
  const yaEstan = new Set(filas.map((fila) => fila.key));

  const faltantes = valores.filter((value) => !yaEstan.has(value.key));
  if (faltantes.length > 0) {
    await repositorio.save(repositorio.create(faltantes));
  }

  return {
    table: repositorio.metadata.tableName,
    creados: faltantes.length,
    existentes: valores.length - faltantes.length,
  };
}

/**
 * Siembra `role_permission` a partir de los roles que declara cada permission.
 *
 * Los ids se resuelven por `key` y no se cablean: la key primaria es un
 * `SERIAL`, así que en dos bases distintas el mismo role puede tener ids
 * distintos.
 */
async function seedRolePermissions(
  manager: EntityManager,
): Promise<TableSummary> {
  const roleIds = await mapIdsByKey(manager.getRepository(Role));
  const permissionIds = await mapIdsByKey(manager.getRepository(Permission));

  const asignaciones = PERMISSIONS.flatMap((permission) =>
    permission.roles.map((role) => ({
      idRole: requireId(roleIds, role, 'role'),
      idPermission: requireId(permissionIds, permission.key, 'permission'),
    })),
  );

  const repositorio = manager.getRepository(RolePermission);
  const filas = await repositorio.find({
    select: { idRole: true, idPermission: true },
    withDeleted: true,
  });
  const yaEstan = new Set(filas.map(comoPar));

  const faltantes = asignaciones.filter(
    (asignacion) => !yaEstan.has(comoPar(asignacion)),
  );
  if (faltantes.length > 0) {
    await repositorio.save(repositorio.create(faltantes));
  }

  return {
    table: repositorio.metadata.tableName,
    creados: faltantes.length,
    existentes: asignaciones.length - faltantes.length,
  };
}

/**
 * Siembra las categorías iniciales del catálogo, todas en status `active`.
 *
 * A diferencia de los catálogos, `category` no tiene `key`: lo que la
 * identifica es el `name`.
 */
async function seedCategories(manager: EntityManager): Promise<TableSummary> {
  const statuses = manager.getRepository(CategoryStatus);
  const inicial = await statuses.findOne({
    where: { key: INITIAL_CATEGORY_STATUS },
    withDeleted: true,
    // Mismo criterio de desempate que `mapIdsByKey`: si la key quedó
    // repetida entre una fila dada de baja y su reemplazo, gana la más nueva.
    // Sin `order`, cuál de las dos vuelve lo decide PostgreSQL.
    order: { id: 'DESC' },
  });

  if (!inicial) {
    // No debería pasar: `category_status` se siembra unos renglones antes, en
    // esta misma transacción. Si pasa, es que alguien cambió el order.
    throw new Error(
      `Falta el status de categoría "${INITIAL_CATEGORY_STATUS}": las ` +
        `categorías no pueden sembrarse antes que sus statuses.`,
    );
  }

  const repositorio = manager.getRepository(Category);
  const filas = await repositorio.find({
    where: { name: In(CATEGORIES.map((category) => category.name)) },
    select: { name: true },
    withDeleted: true,
  });
  const yaEstan = new Set(filas.map((fila) => fila.name));

  const faltantes = CATEGORIES.filter(
    (category) => !yaEstan.has(category.name),
  ).map((category) => ({ ...category, idCategoryStatus: inicial.id }));

  if (faltantes.length > 0) {
    await repositorio.save(repositorio.create(faltantes));
  }

  return {
    table: repositorio.metadata.tableName,
    creados: faltantes.length,
    existentes: CATEGORIES.length - faltantes.length,
  };
}

/** `key` → `id` de una table de catálogo. */
async function mapIdsByKey(
  repositorio: Repository<CatalogEntity>,
): Promise<Map<string, number>> {
  const filas = await repositorio.find({
    select: { id: true, key: true },
    withDeleted: true,
    // Si una key quedó repetida entre una fila dada de baja y su reemplazo,
    // gana la última: `new Map()` se queda con la input más nueva.
    order: { id: 'ASC' },
  });

  return new Map(filas.map((fila) => [fila.key, fila.id]));
}

function requireId(
  ids: Map<string, number>,
  key: string,
  table: string,
): number {
  const id = ids.get(key);

  if (id === undefined) {
    throw new Error(
      `No existe el ${table} con key "${key}". Revisá que esté declarado en ` +
        `src/database/seeds/definitions.ts.`,
    );
  }

  return id;
}

/** Identidad de una asignación role–permission, para comparar de a conjuntos. */
function comoPar(asignacion: { idRole: number; idPermission: number }): string {
  return `${asignacion.idRole}:${asignacion.idPermission}`;
}
