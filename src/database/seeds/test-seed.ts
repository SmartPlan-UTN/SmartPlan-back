import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { hash, argon2id } from 'argon2';
import { ARGON2_OPCIONES } from '../../auth/auth.constants';
import { BaseEntity } from '../../common/entities/base-entity';
import { Country } from '../../places/entities/country.entity';
import { City } from '../../places/entities/city.entity';
import { Department } from '../../places/entities/department.entity';
import { Place } from '../../places/entities/place.entity';
import { Category } from '../../categories/entities/category.entity';
import { Activity } from '../../activities/entities/activity.entity';
import { ActivityCategory } from '../../activities/entities/activity-category.entity';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { Role } from '../../users/entities/role.entity';
import { UserStatus } from '../../users/entities/user-status.entity';
import { User } from '../../users/entities/user.entity';
import { Plan, PlanVisibility } from '../../plans/entities/plan.entity';
import { PlanStatus } from '../../plans/entities/plan-status.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { ADMIN_ROLE, USER_ROLE } from './definitions';
import { TableSummary } from './seed';

export const TEST_ADMIN_EMAIL = 'admin@test.com';
export const TEST_USER_EMAIL = 'user@test.com';
export const TEST_PASSWORD = '123456789010';

const ACTIVE_USER_STATUS = 'active';
const PLACEHOLDER_ACTIVITY_TYPE = 'outdoor';

interface ActivitySeed {
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  type: string;
  categoryName: string;
  placeName: string;
}

const ACTIVITIES: readonly ActivitySeed[] = [
  {
    name: 'Caminata en el Parque General San Martín',
    description:
      'Recorrido a pie por los senderos y el lago del parque más grande de Mendoza.',
    estimatedCost: 0,
    estimatedDuration: 90,
    type: PLACEHOLDER_ACTIVITY_TYPE,
    categoryName: 'Outdoors',
    placeName: 'Parque General San Martín',
  },
  {
    name: 'Visita guiada al Museo del Área Fundacional',
    description:
      'Recorrido guiado por los restos arqueológicos y la historia de la fundación de Mendoza.',
    estimatedCost: 2500,
    estimatedDuration: 60,
    type: 'culture',
    categoryName: 'Culture',
    placeName: 'Museo del Área Fundacional',
  },
  {
    name: 'Cena de maridaje en Vines & Wines',
    description:
      'Menú de cocina regional maridado con vinos mendocinos en un ambiente íntimo.',
    estimatedCost: 18000,
    estimatedDuration: 120,
    type: 'gastronomy',
    categoryName: 'Gastronomy',
    placeName: 'Vines & Wines',
  },
];

interface PlaceSeed {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
}

const PLACES: readonly PlaceSeed[] = [
  {
    name: 'Parque General San Martín',
    description: 'Parque urbano con lago, cerro y senderos.',
    address: 'Av. Emilio Civit s/n, Ciudad de Mendoza',
    latitude: -32.8934,
    longitude: -68.8663,
  },
  {
    name: 'Museo del Área Fundacional',
    description: 'Museo histórico sobre el sitio fundacional de la ciudad.',
    address: 'Alberdi 288, Ciudad de Mendoza',
    latitude: -32.8886,
    longitude: -68.8458,
  },
  {
    name: 'Vines & Wines',
    description: 'Restaurante de cocina regional y carta de vinos locales.',
    address: 'Chile 1900, Ciudad de Mendoza',
    latitude: -32.8908,
    longitude: -68.8442,
  },
];

interface PlanDetailSeed {
  activityName: string;
  order: number;
  note: string | null;
}

interface PlanSeed {
  title: string;
  description: string;
  statusKey: string;
  peopleCount: number;
  visibility: PlanVisibility;
  details: readonly PlanDetailSeed[];
}

const PLANS: readonly PlanSeed[] = [
  {
    title: 'Finde cultural en Mendoza',
    description: 'Museo por la tarde y cena de maridaje para cerrar el día.',
    statusKey: 'confirmed',
    peopleCount: 2,
    visibility: PlanVisibility.Private,
    details: [
      {
        activityName: 'Visita guiada al Museo del Área Fundacional',
        order: 1,
        note: 'Reservar turno con 1 día de anticipación.',
      },
      {
        activityName: 'Cena de maridaje en Vines & Wines',
        order: 2,
        note: null,
      },
    ],
  },
  {
    title: 'Tarde al aire libre',
    description: 'Caminata tranquila por el parque para desconectar.',
    statusKey: 'generated',
    peopleCount: 1,
    visibility: PlanVisibility.Private,
    details: [
      {
        activityName: 'Caminata en el Parque General San Martín',
        order: 1,
        note: null,
      },
    ],
  },
];

export async function seedTestData(
  dataSource: DataSource,
): Promise<TableSummary[]> {
  return dataSource.transaction(async (manager) => {
    const summary: TableSummary[] = [];

    const country = await findOrCreate(
      manager,
      Country,
      { name: 'Argentina' },
      {
        name: 'Argentina',
        description: null,
      },
    );
    summary.push(toSummary(Country, manager, country.created));

    const city = await findOrCreate(
      manager,
      City,
      { name: 'Mendoza', idCountry: country.entity.id },
      { name: 'Mendoza', idCountry: country.entity.id, description: null },
    );
    summary.push(toSummary(City, manager, city.created));

    const department = await findOrCreate(
      manager,
      Department,
      { name: 'Ciudad de Mendoza', idCity: city.entity.id },
      {
        name: 'Ciudad de Mendoza',
        idCity: city.entity.id,
        description: null,
      },
    );
    summary.push(toSummary(Department, manager, department.created));

    const places = new Map<string, Place>();
    let placesCreated = 0;
    for (const placeSeed of PLACES) {
      const result = await findOrCreate(
        manager,
        Place,
        { name: placeSeed.name, idDepartment: department.entity.id },
        {
          name: placeSeed.name,
          description: placeSeed.description,
          address: placeSeed.address,
          idDepartment: department.entity.id,
        },
      );
      places.set(placeSeed.name, result.entity);
      placesCreated += result.created ? 1 : 0;
    }
    summary.push({
      table: manager.getRepository(Place).metadata.tableName,
      created: placesCreated,
      existing: PLACES.length - placesCreated,
    });

    const categories = await mapByName(manager.getRepository(Category), [
      ...new Set(ACTIVITIES.map((activity) => activity.categoryName)),
    ]);

    const activities = new Map<string, Activity>();
    let activitiesCreated = 0;
    for (const activitySeed of ACTIVITIES) {
      const category = requireEntity(
        categories,
        activitySeed.categoryName,
        'category',
      );
      const place = requireEntity(places, activitySeed.placeName, 'place');

      const result = await findOrCreate(
        manager,
        Activity,
        { name: activitySeed.name },
        {
          name: activitySeed.name,
          description: activitySeed.description,
          estimatedCost: activitySeed.estimatedCost,
          estimatedDuration: activitySeed.estimatedDuration,
          type: activitySeed.type,
        },
      );
      activities.set(activitySeed.name, result.entity);

      if (result.created) {
        activitiesCreated += 1;

        await manager.getRepository(ActivityCategory).save(
          manager.getRepository(ActivityCategory).create({
            idActivity: result.entity.id,
            idCategory: category.id,
          }),
        );

        const placeSeed = requireEntity(
          new Map(PLACES.map((seed) => [seed.name, seed])),
          activitySeed.placeName,
          'place seed',
        );
        await manager.getRepository(ActivityPlace).save(
          manager.getRepository(ActivityPlace).create({
            idActivity: result.entity.id,
            idPlace: place.id,
            latitude: placeSeed.latitude,
            longitude: placeSeed.longitude,
          }),
        );
      }
    }
    summary.push({
      table: manager.getRepository(Activity).metadata.tableName,
      created: activitiesCreated,
      existing: ACTIVITIES.length - activitiesCreated,
    });

    const adminRole = await findByKeyOrThrow(
      manager.getRepository(Role),
      ADMIN_ROLE,
      'role',
    );
    const userRole = await findByKeyOrThrow(
      manager.getRepository(Role),
      USER_ROLE,
      'role',
    );
    const activeStatus = await findByKeyOrThrow(
      manager.getRepository(UserStatus),
      ACTIVE_USER_STATUS,
      'user status',
    );

    const passwordHash = await hash(TEST_PASSWORD, {
      type: argon2id,
      ...ARGON2_OPCIONES,
    });

    const adminUser = await findOrCreate(
      manager,
      User,
      { email: TEST_ADMIN_EMAIL },
      {
        name: 'Admin',
        lastName: 'Test',
        email: TEST_ADMIN_EMAIL,
        phone: null,
        passwordHash,
        idRole: adminRole.id,
        idUserStatus: activeStatus.id,
      },
    );
    summary.push(toSummary(User, manager, adminUser.created));

    const regularUser = await findOrCreate(
      manager,
      User,
      { email: TEST_USER_EMAIL },
      {
        name: 'User',
        lastName: 'Test',
        email: TEST_USER_EMAIL,
        phone: null,
        passwordHash,
        idRole: userRole.id,
        idUserStatus: activeStatus.id,
      },
    );
    summary.push(toSummary(User, manager, regularUser.created));

    const planStatuses = await mapByKey(manager.getRepository(PlanStatus), [
      ...new Set(PLANS.map((plan) => plan.statusKey)),
    ]);

    let plansCreated = 0;
    let planDetailsCreated = 0;
    for (const planSeed of PLANS) {
      const status = requireEntity(
        planStatuses,
        planSeed.statusKey,
        'plan status',
      );

      const detailActivities = planSeed.details.map((detail) =>
        requireEntity(activities, detail.activityName, 'activity'),
      );
      const estimatedTotalCost = detailActivities.reduce(
        (total, activity) => total + activity.estimatedCost,
        0,
      );
      const estimatedTotalDuration = detailActivities.reduce(
        (total, activity) => total + activity.estimatedDuration,
        0,
      );

      const result = await findOrCreate(
        manager,
        Plan,
        { title: planSeed.title, idUser: adminUser.entity.id },
        {
          title: planSeed.title,
          description: planSeed.description,
          idUser: adminUser.entity.id,
          idPlanRequest: null,
          idPlanStatus: status.id,
          estimatedTotalCost,
          estimatedTotalDuration,
          peopleCount: planSeed.peopleCount,
          completedAt: null,
          feedbackRequestedAt: null,
          travelDistanceMeters: null,
          travelDurationSeconds: null,
          visibility: planSeed.visibility,
        },
      );

      if (result.created) {
        plansCreated += 1;

        const details = planSeed.details.map((detail, index) => {
          const activity = detailActivities[index];

          return manager.getRepository(PlanDetail).create({
            idPlan: result.entity.id,
            idActivity: activity.id,
            order: detail.order,
            estimatedCost: activity.estimatedCost,
            estimatedDuration: activity.estimatedDuration,
            note: detail.note,
          });
        });
        await manager.getRepository(PlanDetail).save(details);
        planDetailsCreated += details.length;
      }
    }
    summary.push({
      table: manager.getRepository(Plan).metadata.tableName,
      created: plansCreated,
      existing: PLANS.length - plansCreated,
    });
    summary.push({
      table: manager.getRepository(PlanDetail).metadata.tableName,
      created: planDetailsCreated,
      existing: 0,
    });

    return summary;
  });
}

interface FindOrCreateResult<T> {
  entity: T;
  created: boolean;
}

async function findOrCreate<T extends BaseEntity>(
  manager: EntityManager,
  entity: new () => T,
  where: FindOptionsWhere<T>,
  data: Partial<T>,
): Promise<FindOrCreateResult<T>> {
  const repository = manager.getRepository(entity);
  const existing = await repository.findOne({ where, withDeleted: true });

  if (existing) {
    return { entity: existing, created: false };
  }

  const created = await repository.save(repository.create(data as T));
  return { entity: created, created: true };
}

async function mapByName<T extends BaseEntity & { name: string }>(
  repository: Repository<T>,
  names: readonly string[],
): Promise<Map<string, T>> {
  const rows = await repository.find({
    where: names.map((name) => ({ name }) as FindOptionsWhere<T>),
    withDeleted: true,
  });

  return new Map(rows.map((row) => [row.name, row]));
}

async function mapByKey<T extends BaseEntity & { key: string }>(
  repository: Repository<T>,
  keys: readonly string[],
): Promise<Map<string, T>> {
  const rows = await repository.find({
    where: keys.map((key) => ({ key }) as FindOptionsWhere<T>),
    withDeleted: true,
  });

  return new Map(rows.map((row) => [row.key, row]));
}

async function findByKeyOrThrow<T extends BaseEntity & { key: string }>(
  repository: Repository<T>,
  key: string,
  label: string,
): Promise<T> {
  const found = await repository.findOne({
    where: { key } as FindOptionsWhere<T>,
    withDeleted: true,
  });

  if (!found) {
    throw new Error(
      `No ${label} with key "${key}". Run "pnpm db:seed" before "pnpm db:seed:test".`,
    );
  }

  return found;
}

function requireEntity<T>(map: Map<string, T>, key: string, label: string): T {
  const value = map.get(key);

  if (!value) {
    throw new Error(`No ${label} named "${key}" was seeded.`);
  }

  return value;
}

function toSummary<T extends BaseEntity>(
  entity: new () => T,
  manager: EntityManager,
  created: boolean,
): TableSummary {
  return {
    table: manager.getRepository(entity).metadata.tableName,
    created: created ? 1 : 0,
    existing: created ? 0 : 1,
  };
}
