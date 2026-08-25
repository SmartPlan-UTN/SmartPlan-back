import { INestApplication } from '@nestjs/common';
import { DataSource, DeepPartial, Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { CategoryStatus } from '../src/categories/entities/category-status.entity';
import { Category } from '../src/categories/entities/category.entity';
import { CatalogEntity } from '../src/common/entities/catalog-entity';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import {
  Rating,
  RatingModerationStatus,
} from '../src/ratings/entities/rating.entity';
import { Role } from '../src/users/entities/role.entity';
import { UserStatus } from '../src/users/entities/user-status.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Search and exploration API (e2e)', () => {
  let app: INestApplication<App>;
  let activity: Activity;
  let category: Category;
  let place: Place;
  let plan: Plan;
  let dataSource: DataSource;

  const createdIds: Record<string, number> = {};

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedExplorationData();
  });

  afterAll(async () => {
    await removeExplorationData();
    await app.close();
  });

  it('searches and filters activities with stable pagination (CU9-CU11)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/activities')
      .query({
        search: 'Wine',
        categoryIds: String(category.id),
        type: 'guided-tour',
        minPrice: 80,
        maxPrice: 120,
        minRating: 4,
        latitude: -32.9,
        longitude: -68.8,
        maxDistanceKm: 5,
        sortBy: 'rating',
        page: 1,
        limit: 10,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        {
          id: activity.id,
          name: 'Wine Experience',
          estimatedCost: 100,
          averageRating: 4.5,
          ratingCount: 2,
          categories: [{ id: category.id, name: 'Exploration gastronomy' }],
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    const body = response.body as { data: Array<{ distanceKm: number }> };
    expect(body.data[0].distanceKm).toBeLessThan(0.1);
  });

  it('rejects an incomplete distance filter (CU10-CU11)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/activities')
      .query({ latitude: -32.9, sortBy: 'distance' })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'INCOMPLETE_LOCATION_FILTER',
    });
  });

  it('returns the complete activity detail (CU14)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/activities/${activity.id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: activity.id,
      name: 'Wine Experience',
      averageRating: 4.5,
      ratingCount: 2,
      locations: [
        {
          place: {
            id: place.id,
            name: 'Central Winery',
            department: {
              name: 'Capital',
              city: { name: 'Mendoza', country: { name: 'Argentina' } },
            },
          },
        },
      ],
    });
  });

  it('returns controlled errors for missing activities (CU14)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/activities/999999')
      .expect(404);

    expect(response.body).toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
  });

  it('returns map markers inside the requested viewport (CU16)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/activities/map')
      .query({
        south: -33,
        north: -32,
        west: -69,
        east: -68,
        categoryIds: String(category.id),
        page: 1,
        limit: 10,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        {
          activityId: activity.id,
          placeId: place.id,
          name: 'Wine Experience',
          placeName: 'Central Winery',
          latitude: -32.9,
          longitude: -68.8,
        },
      ],
      pagination: { total: 1 },
    });
  });

  it('rejects invalid map bounds (CU16)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/activities/map')
      .query({ south: -32, north: -33, west: -69, east: -68 })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_MAP_BOUNDS' });
  });

  it('paginates activities ordered by price (CU9-CU11)', async () => {
    const firstPage = await request(app.getHttpServer())
      .get('/api/activities')
      .query({ sortBy: 'price', direction: 'asc', page: 1, limit: 1 })
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/api/activities')
      .query({ sortBy: 'price', direction: 'asc', page: 2, limit: 1 })
      .expect(200);

    expect(firstPage.body).toMatchObject({
      data: [{ name: 'Remote Museum', type: 'museum' }],
      pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
    });
    expect(secondPage.body).toMatchObject({
      data: [{ name: 'Wine Experience', type: 'guided-tour' }],
      pagination: { page: 2, limit: 1, total: 2, totalPages: 2 },
    });
  });

  it('searches plans and returns card information (CU12)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/plans')
      .query({ search: 'Mendoza', categoryIds: String(category.id) })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        {
          id: plan.id,
          title: 'Mendoza Highlights',
          activityCount: 2,
          activityNames: ['Wine Experience', 'Remote Museum'],
          estimatedTotalCost: 100,
          averageRating: 4.5,
          categories: [{ id: category.id, name: 'Exploration gastronomy' }],
          status: { key: 'generated' },
        },
      ],
      pagination: { total: 1 },
    });
  });

  it('drops soft-deleted activities from the itinerary chain and its count (CU12)', async () => {
    // `activityCount` is derived from `activityNames`, which skips activities
    // whose `deleted_at` is set. Nothing soft-deletes activities yet, so this
    // pins the contract before CU56 (Eliminar contenido) makes it reachable.
    const activities = dataSource.getRepository(Activity);
    await activities.softDelete(createdIds.secondActivity);

    try {
      const response = await request(app.getHttpServer())
        .get('/api/plans')
        .query({ search: 'Mendoza' })
        .expect(200);

      expect(response.body).toMatchObject({
        data: [
          {
            id: plan.id,
            activityCount: 1,
            activityNames: ['Wine Experience'],
          },
        ],
      });
    } finally {
      await activities.restore(createdIds.secondActivity);
    }
  });

  it('returns an ordered plan itinerary without user credentials (CU13)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/plans/${plan.id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: plan.id,
      title: 'Mendoza Highlights',
      activityCount: 2,
      activityNames: ['Wine Experience', 'Remote Museum'],
      details: [
        {
          order: 1,
          activity: { id: activity.id, name: 'Wine Experience' },
        },
        {
          order: 2,
          activity: { name: 'Remote Museum' },
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('email');
    expect(response.body).not.toHaveProperty('requestCriteria');
    const body = response.body as { details: unknown[] };
    expect(body.details[0]).not.toHaveProperty('note');
  });

  it('does not expose cancelled plans through public exploration (CU12-CU13)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/plans')
      .query({ search: 'Private cancelled plan' })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [],
      pagination: { total: 0 },
    });
    await request(app.getHttpServer())
      .get(`/api/plans/${createdIds.cancelledPlan}`)
      .expect(404);
  });

  it('lists active categories with pagination (CU10)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/categories')
      .query({ search: 'Exploration gastronomy', page: 1, limit: 10 })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        {
          id: category.id,
          name: 'Exploration gastronomy',
        },
      ],
      pagination: { total: 1 },
    });
    const body = response.body as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).not.toHaveProperty('status');
  });

  it('does not expose or filter by inactive categories (CU10)', async () => {
    const categoryResponse = await request(app.getHttpServer())
      .get('/api/categories')
      .query({ search: 'Hidden category' })
      .expect(200);
    const activityResponse = await request(app.getHttpServer())
      .get('/api/activities')
      .query({ categoryIds: String(createdIds.inactiveCategory) })
      .expect(200);

    expect(categoryResponse.body).toMatchObject({
      data: [],
      pagination: { total: 0 },
    });
    expect(activityResponse.body).toMatchObject({
      data: [],
      pagination: { total: 0 },
    });
  });

  it('lists places by department (CU14-CU16)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/places')
      .query({
        search: 'Winery',
        departmentId: createdIds.department,
        page: 1,
        limit: 10,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [{ id: place.id, name: 'Central Winery' }],
      pagination: { total: 1 },
    });
  });

  it('returns a place with its complete hierarchy (CU14-CU16)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/places/${place.id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: place.id,
      department: {
        name: 'Capital',
        city: { name: 'Mendoza', country: { name: 'Argentina' } },
      },
    });
  });

  async function seedExplorationData(): Promise<void> {
    const categoryStatuses = dataSource.getRepository(CategoryStatus);
    const categories = dataSource.getRepository(Category);
    const countries = dataSource.getRepository(Country);
    const cities = dataSource.getRepository(City);
    const departments = dataSource.getRepository(Department);
    const places = dataSource.getRepository(Place);
    const activities = dataSource.getRepository(Activity);
    const activityCategories = dataSource.getRepository(ActivityCategory);
    const activityPlaces = dataSource.getRepository(ActivityPlace);
    const ratings = dataSource.getRepository(Rating);
    const roles = dataSource.getRepository(Role);
    const userStatuses = dataSource.getRepository(UserStatus);
    const users = dataSource.getRepository(User);
    const planStatuses = dataSource.getRepository(PlanStatus);
    const plans = dataSource.getRepository(Plan);
    const planDetails = dataSource.getRepository(PlanDetail);

    const categoryStatus = await findOrCreateCatalog(categoryStatuses, {
      key: 'active',
      name: 'Activa',
    });
    category = await categories.save(
      categories.create({
        name: 'Exploration gastronomy',
        description: 'Food and drink experiences',
        idCategoryStatus: categoryStatus.id,
      }),
    );
    createdIds.category = category.id;
    const inactiveCategoryStatus = await findOrCreateCatalog(categoryStatuses, {
      key: 'inactive',
      name: 'Inactiva',
    });
    const inactiveCategory = await categories.save(
      categories.create({
        name: 'Hidden category',
        description: 'Must not be exposed by public exploration',
        idCategoryStatus: inactiveCategoryStatus.id,
      }),
    );
    createdIds.inactiveCategory = inactiveCategory.id;

    const country = await countries.save(
      countries.create({ name: 'Argentina', description: null }),
    );
    createdIds.country = country.id;
    const city = await cities.save(
      cities.create({
        idCountry: country.id,
        name: 'Mendoza',
        description: null,
      }),
    );
    createdIds.city = city.id;
    const department = await departments.save(
      departments.create({
        idCity: city.id,
        name: 'Capital',
        description: null,
      }),
    );
    createdIds.department = department.id;
    place = await places.save(
      places.create({
        name: 'Central Winery',
        description: 'Urban tasting room',
        address: '123 Main Street',
        idDepartment: department.id,
      }),
    );
    createdIds.place = place.id;

    activity = await activities.save(
      activities.create({
        name: 'Wine Experience',
        description: 'Guided tasting near downtown',
        estimatedCost: 100,
        estimatedDuration: 120,
        type: 'guided-tour',
      }),
    );
    createdIds.activity = activity.id;
    const secondActivity = await activities.save(
      activities.create({
        name: 'Remote Museum',
        description: 'History exhibition outside the viewport',
        estimatedCost: 40,
        estimatedDuration: 60,
        type: 'museum',
      }),
    );
    createdIds.secondActivity = secondActivity.id;

    const categoryRelation = await activityCategories.save(
      activityCategories.create({
        idActivity: activity.id,
        idCategory: category.id,
      }),
    );
    createdIds.activityCategory = categoryRelation.id;
    const inactiveCategoryRelation = await activityCategories.save(
      activityCategories.create({
        idActivity: activity.id,
        idCategory: inactiveCategory.id,
      }),
    );
    createdIds.inactiveActivityCategory = inactiveCategoryRelation.id;
    const location = await activityPlaces.save(
      activityPlaces.create({
        idActivity: activity.id,
        idPlace: place.id,
        latitude: -32.9,
        longitude: -68.8,
        notes: 'Main entrance',
      }),
    );
    createdIds.activityPlace = location.id;

    const role = await findOrCreateCatalog(roles, {
      key: 'user',
      name: 'Usuario',
    });
    const userStatus = await findOrCreateCatalog(userStatuses, {
      key: 'active',
      name: 'Activo',
    });
    const user = await users.save(
      users.create({
        name: 'Search',
        lastName: 'Tester',
        email: 'search-exploration-e2e@smartplan.test',
        passwordHash: 'not-a-real-password-hash',
        idRole: role.id,
        idUserStatus: userStatus.id,
      }),
    );
    createdIds.user = user.id;
    const planStatus = await findOrCreateCatalog(planStatuses, {
      key: 'generated',
      name: 'Generado',
    });
    plan = await plans.save(
      plans.create({
        title: 'Mendoza Highlights',
        description: 'A curated city experience',
        idUser: user.id,
        idPlanRequest: null,
        idPlanStatus: planStatus.id,
        estimatedTotalCost: 100,
        estimatedTotalDuration: 120,
      }),
    );
    createdIds.plan = plan.id;
    const firstRating = await ratings.save(
      ratings.create({
        score: 5,
        idActivity: activity.id,
        idUser: user.id,
        idPlan: plan.id,
        comment: null,
        moderationStatus: RatingModerationStatus.Approved,
        moderationReason: null,
        idFeedback: null,
      }),
    );
    const secondUser = await users.save(
      users.create({
        name: 'Search Two',
        lastName: 'Tester',
        email: 'search-exploration-second@smartplan.test',
        passwordHash: 'not-a-real-password-hash',
        idRole: role.id,
        idUserStatus: userStatus.id,
      }),
    );
    createdIds.secondUser = secondUser.id;
    const secondRating = await ratings.save(
      ratings.create({
        score: 4,
        idActivity: activity.id,
        idUser: secondUser.id,
        idPlan: plan.id,
        comment: null,
        moderationStatus: RatingModerationStatus.Approved,
        moderationReason: null,
        idFeedback: null,
      }),
    );
    createdIds.firstRating = firstRating.id;
    createdIds.secondRating = secondRating.id;
    const cancelledPlanStatus = await findOrCreateCatalog(planStatuses, {
      key: 'cancelled',
      name: 'Cancelado',
    });
    const cancelledPlan = await plans.save(
      plans.create({
        title: 'Private cancelled plan',
        description: 'Must not be exposed by public exploration',
        idUser: user.id,
        idPlanRequest: null,
        idPlanStatus: cancelledPlanStatus.id,
        estimatedTotalCost: 0,
        estimatedTotalDuration: 0,
      }),
    );
    createdIds.cancelledPlan = cancelledPlan.id;
    // Saved before the first step on purpose: the itinerary order must come
    // from `order`, not from the order the rows happen to be inserted in.
    const secondPlanDetail = await planDetails.save(
      planDetails.create({
        idPlan: plan.id,
        idActivity: secondActivity.id,
        order: 2,
        estimatedCost: 40,
        estimatedDuration: 60,
        note: null,
      }),
    );
    createdIds.secondPlanDetail = secondPlanDetail.id;
    const planDetail = await planDetails.save(
      planDetails.create({
        idPlan: plan.id,
        idActivity: activity.id,
        order: 1,
        estimatedCost: 100,
        estimatedDuration: 120,
        note: null,
      }),
    );
    createdIds.planDetail = planDetail.id;
  }

  async function findOrCreateCatalog<T extends CatalogEntity>(
    repository: Repository<T>,
    data: { key: string; name: string },
  ): Promise<T> {
    const existing = await repository.findOne({
      where: { key: data.key } as never,
    });

    if (existing) return existing;

    const entity = repository.create({
      ...data,
      description: null,
    } as DeepPartial<T>);
    return repository.save(entity);
  }

  async function removeExplorationData(): Promise<void> {
    if (!dataSource) return;

    await removeById(
      dataSource.getRepository(PlanDetail),
      createdIds.planDetail,
    );
    await removeById(
      dataSource.getRepository(PlanDetail),
      createdIds.secondPlanDetail,
    );
    await removeById(dataSource.getRepository(Rating), createdIds.firstRating);
    await removeById(dataSource.getRepository(Rating), createdIds.secondRating);
    await removeById(dataSource.getRepository(Plan), createdIds.cancelledPlan);
    await removeById(dataSource.getRepository(Plan), createdIds.plan);
    await removeById(dataSource.getRepository(User), createdIds.user);
    await removeById(dataSource.getRepository(User), createdIds.secondUser);
    await removeById(
      dataSource.getRepository(ActivityPlace),
      createdIds.activityPlace,
    );
    await removeById(
      dataSource.getRepository(ActivityCategory),
      createdIds.inactiveActivityCategory,
    );
    await removeById(
      dataSource.getRepository(ActivityCategory),
      createdIds.activityCategory,
    );
    await removeById(dataSource.getRepository(Activity), createdIds.activity);
    await removeById(
      dataSource.getRepository(Activity),
      createdIds.secondActivity,
    );
    await removeById(dataSource.getRepository(Place), createdIds.place);
    await removeById(
      dataSource.getRepository(Department),
      createdIds.department,
    );
    await removeById(dataSource.getRepository(City), createdIds.city);
    await removeById(dataSource.getRepository(Country), createdIds.country);
    await removeById(dataSource.getRepository(Category), createdIds.category);
    await removeById(
      dataSource.getRepository(Category),
      createdIds.inactiveCategory,
    );
  }

  async function removeById<T extends { id: number }>(
    repository: Repository<T>,
    id: number | undefined,
  ): Promise<void> {
    if (id !== undefined) {
      await repository.delete(id);
    }
  }
});
