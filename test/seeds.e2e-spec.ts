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

/**
 * La semilla contra PostgreSQL de verdad (F09).
 *
 * Es un e2e y no un unitario porque lo que hay que probar es justamente lo que
 * un doble de repositorio no puede reproducir: que la secondRun corrida no
 * duplique nada. Eso depende de los índices únicos parciales del model y de
 * cómo se comportan frente a la baja lógica, no de la lógica de la función.
 *
 * Las definiciones no se copian acá: los totales esperados se calculan a partir
 * de `definiciones.ts`. Un test que repitiera "49 permissions" habría que
 * actualizarlo cada vez que se suma uno, y lo que estaría verificando es que
 * alguien supo contar, no que la semilla funciona.
 */
describe('Data semilla (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let roles: Repository<Role>;
  let permissions: Repository<Permission>;
  let rolePermissions: Repository<RolePermission>;
  let categories: Repository<Category>;
  let categoryStatuses: Repository<CategoryStatus>;

  /** Repositorio de cada table que toca la semilla, por name de table. */
  let sembradas: Map<string, Repository<ObjectLiteral>>;

  /** Cuántas filas tiene que dejar la semilla en cada una de esas tablas. */
  const esperadas: Record<string, number> = {
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

    sembradas = new Map<string, Repository<ObjectLiteral>>([
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
    // Las hijas primero: `category` referencia a `category_status` con
    // `RESTRICT`, así que borrarlas al revés falla.
    await rolePermissions.deleteAll();
    await categories.deleteAll();

    for (const [table, repositorio] of sembradas) {
      if (table !== 'role_permission' && table !== 'category') {
        await repositorio.deleteAll();
      }
    }
  });

  /** El summary que devuelve la semilla, indexado por table. */
  function byTable(summary: TableSummary[]): Record<string, TableSummary> {
    return Object.fromEntries(summary.map((fila) => [fila.table, fila]));
  }

  /** Cuántas filas activas quedaron en cada table sembrada. */
  async function contar(): Promise<Record<string, number>> {
    const conteos: Record<string, number> = {};

    for (const [table, repositorio] of sembradas) {
      conteos[table] = await repositorio.count();
    }

    return conteos;
  }

  it('siembra roles, permissions, statuses y categorías envelope una base vacía', async () => {
    const summary = byTable(await seedInitialData(dataSource));

    for (const [table, quantity] of Object.entries(esperadas)) {
      expect(summary[table]).toEqual({
        table,
        creados: quantity,
        existentes: 0,
      });
    }
    await expect(contar()).resolves.toEqual(esperadas);
  });

  it('no duplica nada al correrla dos veces', async () => {
    await seedInitialData(dataSource);
    const secondRun = byTable(await seedInitialData(dataSource));

    for (const [table, quantity] of Object.entries(esperadas)) {
      expect(secondRun[table]).toEqual({
        table,
        creados: 0,
        existentes: quantity,
      });
    }
    await expect(contar()).resolves.toEqual(esperadas);
  });

  it('deja al admin con todos los permissions y al user con los suyos (CU61)', async () => {
    await seedInitialData(dataSource);

    const grantedPermissions = async (key: string): Promise<string[]> => {
      const role = await roles.findOneByOrFail({ key: key });
      const asignaciones = await rolePermissions.find({
        where: { idRole: role.id },
        relations: { permission: true },
      });

      return asignaciones.map((asignacion) => asignacion.permission.key).sort();
    };

    const deUser = PERMISSIONS.filter((permission) =>
      permission.roles.includes('user'),
    ).map((permission) => permission.key);

    await expect(grantedPermissions('admin')).resolves.toEqual(
      PERMISSIONS.map((permission) => permission.key).sort(),
    );
    await expect(grantedPermissions('user')).resolves.toEqual(deUser.sort());
    // Los permissions de administración no llegan al role de user.
    await expect(grantedPermissions('user')).resolves.not.toContain(
      'user.list',
    );
  });

  it('deja las categorías iniciales en status active (CU54)', async () => {
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

  it('no revive un value que fue dado de baja', async () => {
    await seedInitialData(dataSource);

    const [primera] = await categories.find({ order: { id: 'ASC' }, take: 1 });
    await categories.softRemove(primera);

    const summary = byTable(await seedInitialData(dataSource));

    // Una baja lógica es una decisión de la administración (CU54): la semilla
    // la respeta en vez de reponer la fila en el próximo despliegue.
    expect(summary.category.creados).toBe(0);
    await expect(categories.count()).resolves.toBe(CATEGORIES.length - 1);
    await expect(categories.count({ withDeleted: true })).resolves.toBe(
      CATEGORIES.length,
    );
  });

  it('repone lo que falta sin pisar lo que ya estaba', async () => {
    await seedInitialData(dataSource);

    const editado = await roles.findOneByOrFail({ key: 'user' });
    await roles.update(editado.id, { name: 'User final' });
    // El borrado físico se lleva puestas sus asignaciones (`onDelete: CASCADE`),
    // así que la semilla tiene que reponer el permission y volver a otorgarlo.
    const otorgadas = PERMISSIONS.find(
      (permission) => permission.key === 'plan.generate',
    )!.roles.length;
    await permissions.delete({ key: 'plan.generate' });

    const summary = byTable(await seedInitialData(dataSource));

    expect(summary.permission.creados).toBe(1);
    expect(summary.role.creados).toBe(0);
    expect(summary.role_permission.creados).toBe(otorgadas);
    await expect(contar()).resolves.toEqual(esperadas);
    // El name lo edita la administración (CU62): la semilla no lo pisa.
    await expect(roles.findOneByOrFail({ key: 'user' })).resolves.toEqual(
      expect.objectContaining({ name: 'User final' }),
    );
  });
});
