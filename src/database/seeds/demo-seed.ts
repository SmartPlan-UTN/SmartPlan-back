import { hash, argon2id } from 'argon2';
import { DataSource, EntityManager } from 'typeorm';
import { ARGON2_OPCIONES } from '../../auth/auth.constants';
import { Activity } from '../../activities/entities/activity.entity';
import { ActivityCategory } from '../../activities/entities/activity-category.entity';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { Category } from '../../categories/entities/category.entity';
import { Country } from '../../places/entities/country.entity';
import { City } from '../../places/entities/city.entity';
import { Department } from '../../places/entities/department.entity';
import { Place } from '../../places/entities/place.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { PlanStatus } from '../../plans/entities/plan-status.entity';
import { Role } from '../../users/entities/role.entity';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/entities/user-status.entity';
import { TableSummary } from './seed';
import {
  DEMO_ACTIVITIES,
  DEMO_CITIES,
  DEMO_COUNTRIES,
  DEMO_DEPARTMENTS,
  DEMO_PLACES,
  DEMO_PLANS,
  DEMO_USER,
} from './demo-definitions';

export async function seedDemoContent(
  dataSource: DataSource,
): Promise<TableSummary[]> {
  return dataSource.transaction(async (manager) => {
    const summary: TableSummary[] = [];

    const countries = await seedCountries(manager);
    summary.push(countries.summary);

    const cities = await seedCities(manager, countries.ids);
    summary.push(cities.summary);

    const departments = await seedDepartments(manager, cities.ids);
    summary.push(departments.summary);

    const places = await seedPlaces(manager, departments.ids);
    summary.push(places.summary);

    const activities = await seedActivities(manager);
    summary.push(activities.summary);

    summary.push(await seedActivityCategories(manager, activities.ids));
    summary.push(await seedActivityPlaces(manager, activities.ids, places.ids));

    const user = await seedDemoUser(manager);
    summary.push(user.summary);

    summary.push(await seedDemoPlans(manager, user.id, activities.ids));

    return summary;
  });
}

async function seedCountries(
  manager: EntityManager,
): Promise<{ summary: TableSummary; ids: Map<string, number> }> {
  const repository = manager.getRepository(Country);
  const ids = new Map<string, number>();
  let created = 0;

  for (const definition of DEMO_COUNTRIES) {
    const existing = await repository.findOne({
      where: { name: definition.name },
      withDeleted: true,
    });

    if (existing) {
      ids.set(definition.name, existing.id);
      continue;
    }

    const country = await repository.save(repository.create(definition));
    ids.set(definition.name, country.id);
    created += 1;
  }

  return {
    ids,
    summary: {
      table: repository.metadata.tableName,
      created,
      existing: DEMO_COUNTRIES.length - created,
    },
  };
}

async function seedCities(
  manager: EntityManager,
  countryIds: Map<string, number>,
): Promise<{ summary: TableSummary; ids: Map<string, number> }> {
  const repository = manager.getRepository(City);
  const ids = new Map<string, number>();
  let created = 0;

  for (const definition of DEMO_CITIES) {
    const idCountry = requireId(countryIds, definition.country, 'country');
    const existing = await repository.findOne({
      where: { name: definition.name, idCountry },
      withDeleted: true,
    });

    if (existing) {
      ids.set(definition.name, existing.id);
      continue;
    }

    const city = await repository.save(
      repository.create({
        name: definition.name,
        description: definition.description,
        idCountry,
      }),
    );
    ids.set(definition.name, city.id);
    created += 1;
  }

  return {
    ids,
    summary: {
      table: repository.metadata.tableName,
      created,
      existing: DEMO_CITIES.length - created,
    },
  };
}

async function seedDepartments(
  manager: EntityManager,
  cityIds: Map<string, number>,
): Promise<{ summary: TableSummary; ids: Map<string, number> }> {
  const repository = manager.getRepository(Department);
  const ids = new Map<string, number>();
  let created = 0;

  for (const definition of DEMO_DEPARTMENTS) {
    const idCity = requireId(cityIds, definition.city, 'city');
    const existing = await repository.findOne({
      where: { name: definition.name, idCity },
      withDeleted: true,
    });

    if (existing) {
      ids.set(definition.name, existing.id);
      continue;
    }

    const department = await repository.save(
      repository.create({
        name: definition.name,
        description: definition.description,
        idCity,
      }),
    );
    ids.set(definition.name, department.id);
    created += 1;
  }

  return {
    ids,
    summary: {
      table: repository.metadata.tableName,
      created,
      existing: DEMO_DEPARTMENTS.length - created,
    },
  };
}

async function seedPlaces(
  manager: EntityManager,
  departmentIds: Map<string, number>,
): Promise<{ summary: TableSummary; ids: Map<string, number> }> {
  const repository = manager.getRepository(Place);
  const ids = new Map<string, number>();
  let created = 0;

  for (const definition of DEMO_PLACES) {
    const idDepartment = requireId(
      departmentIds,
      definition.department,
      'department',
    );
    const existing = await repository.findOne({
      where: { name: definition.name, idDepartment },
      withDeleted: true,
    });

    if (existing) {
      ids.set(definition.name, existing.id);
      continue;
    }

    const place = await repository.save(
      repository.create({
        name: definition.name,
        description: definition.description,
        address: definition.address,
        idDepartment,
      }),
    );
    ids.set(definition.name, place.id);
    created += 1;
  }

  return {
    ids,
    summary: {
      table: repository.metadata.tableName,
      created,
      existing: DEMO_PLACES.length - created,
    },
  };
}

async function seedActivities(
  manager: EntityManager,
): Promise<{ summary: TableSummary; ids: Map<string, number> }> {
  const repository = manager.getRepository(Activity);
  const ids = new Map<string, number>();
  let created = 0;

  for (const definition of DEMO_ACTIVITIES) {
    const existing = await repository.findOne({
      where: { name: definition.name },
      withDeleted: true,
    });

    if (existing) {
      ids.set(definition.name, existing.id);
      continue;
    }

    const activity = await repository.save(
      repository.create({
        name: definition.name,
        description: definition.description,
        estimatedCost: definition.estimatedCost,
        estimatedDuration: definition.estimatedDuration,
        type: definition.type,
      }),
    );
    ids.set(definition.name, activity.id);
    created += 1;
  }

  return {
    ids,
    summary: {
      table: repository.metadata.tableName,
      created,
      existing: DEMO_ACTIVITIES.length - created,
    },
  };
}

async function seedActivityCategories(
  manager: EntityManager,
  activityIds: Map<string, number>,
): Promise<TableSummary> {
  const categoryRepository = manager.getRepository(Category);
  const categories = await categoryRepository.find({ withDeleted: true });
  const categoryIds = new Map(
    categories.map((category) => [category.name, category.id]),
  );

  const repository = manager.getRepository(ActivityCategory);
  const rows = await repository.find({ withDeleted: true });
  const existingPairs = new Set(
    rows.map((row) => `${row.idActivity}:${row.idCategory}`),
  );

  const assignments = DEMO_ACTIVITIES.flatMap((definition) => {
    const idActivity = requireId(activityIds, definition.name, 'activity');

    return definition.categories.map((categoryName) => ({
      idActivity,
      idCategory: requireId(categoryIds, categoryName, 'category'),
    }));
  });

  const missing = assignments.filter(
    (assignment) =>
      !existingPairs.has(`${assignment.idActivity}:${assignment.idCategory}`),
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

async function seedActivityPlaces(
  manager: EntityManager,
  activityIds: Map<string, number>,
  placeIds: Map<string, number>,
): Promise<TableSummary> {
  const repository = manager.getRepository(ActivityPlace);
  const rows = await repository.find({ withDeleted: true });
  const existingPairs = new Set(
    rows.map((row) => `${row.idActivity}:${row.idPlace}`),
  );

  const assignments = DEMO_ACTIVITIES.flatMap((definition) => {
    const idActivity = requireId(activityIds, definition.name, 'activity');

    return definition.places.map((place) => ({
      idActivity,
      idPlace: requireId(placeIds, place.place, 'place'),
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
    }));
  });

  const missing = assignments.filter(
    (assignment) =>
      !existingPairs.has(`${assignment.idActivity}:${assignment.idPlace}`),
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

async function seedDemoUser(
  manager: EntityManager,
): Promise<{ summary: TableSummary; id: number }> {
  const repository = manager.getRepository(User);
  const existing = await repository.findOne({
    where: { email: DEMO_USER.email },
    withDeleted: true,
  });

  if (existing) {
    return {
      id: existing.id,
      summary: {
        table: repository.metadata.tableName,
        created: 0,
        existing: 1,
      },
    };
  }

  const role = await manager
    .getRepository(Role)
    .findOneOrFail({ where: { key: DEMO_USER.role } });
  const status = await manager
    .getRepository(UserStatus)
    .findOneOrFail({ where: { key: DEMO_USER.status } });

  const passwordHash = await hash(DEMO_USER.password, {
    type: argon2id,
    ...ARGON2_OPCIONES,
  });

  const user = await repository.save(
    repository.create({
      name: DEMO_USER.name,
      lastName: DEMO_USER.lastName,
      email: DEMO_USER.email,
      passwordHash,
      idRole: role.id,
      idUserStatus: status.id,
    }),
  );

  return {
    id: user.id,
    summary: { table: repository.metadata.tableName, created: 1, existing: 0 },
  };
}

async function seedDemoPlans(
  manager: EntityManager,
  idUser: number,
  activityIds: Map<string, number>,
): Promise<TableSummary> {
  const planRepository = manager.getRepository(Plan);
  const detailRepository = manager.getRepository(PlanDetail);
  let created = 0;

  for (const definition of DEMO_PLANS) {
    const existing = await planRepository.findOne({
      where: { title: definition.title, idUser },
      withDeleted: true,
    });

    if (existing) {
      continue;
    }

    const status = await manager
      .getRepository(PlanStatus)
      .findOneOrFail({ where: { key: definition.status } });

    const details = definition.details.map((detail) => {
      const activity = DEMO_ACTIVITIES.find((a) => a.name === detail.activity);
      if (!activity) {
        throw new Error(
          `No activity "${detail.activity}" declared in demo-definitions.ts.`,
        );
      }

      return {
        idActivity: requireId(activityIds, detail.activity, 'activity'),
        order: detail.order,
        note: detail.note ?? null,
        estimatedCost: activity.estimatedCost,
        estimatedDuration: activity.estimatedDuration,
      };
    });

    const estimatedTotalCost = details.reduce(
      (sum, d) => sum + d.estimatedCost,
      0,
    );
    const estimatedTotalDuration = details.reduce(
      (sum, d) => sum + d.estimatedDuration,
      0,
    );

    const plan = await planRepository.save(
      planRepository.create({
        title: definition.title,
        description: definition.description,
        idUser,
        idPlanStatus: status.id,
        peopleCount: definition.peopleCount,
        estimatedTotalCost,
        estimatedTotalDuration,
      }),
    );

    await detailRepository.save(
      detailRepository.create(
        details.map((detail) => ({ ...detail, idPlan: plan.id })),
      ),
    );

    created += 1;
  }

  return {
    table: planRepository.metadata.tableName,
    created,
    existing: DEMO_PLANS.length - created,
  };
}

function requireId(
  ids: Map<string, number>,
  key: string,
  table: string,
): number {
  const id = ids.get(key);

  if (id === undefined) {
    throw new Error(
      `No ${table} named "${key}". Verify src/database/seeds/demo-definitions.ts.`,
    );
  }

  return id;
}
