import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Category } from '../src/categories/entities/category.entity';
import { CategoryStatus } from '../src/categories/entities/category-status.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { AddGenerationSearchRadius1791817200000 } from '../src/database/migrations/1791817200000-AddGenerationSearchRadius';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';
import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlanRequest } from '../src/recommendation/entities/plan-request.entity';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { GeographicResolutionService } from '../src/recommendation/geographic-resolution.service';
import { PlanGenerationService } from '../src/recommendation/plan-generation.service';
import { UserPreferenceProfileLookupService } from '../src/users/user-preference-profile-lookup.service';
import { createTestAppWithoutRabbit } from './create-test-app';

/** Real HTTP, PostgreSQL and generation engine; no external provider calls. */
describe('Persisted preferences in generation (CU8/CU17/CU18/CU19 e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let engine: PlanGenerationService;
  let token: string;
  let department: Department;
  let otherDepartment: Department;
  let category: Category;
  let otherCategory: Category;
  let nearIds: number[];
  let countryId: number;
  let cityId: number;
  const userIds: number[] = [];
  const activityIds: number[] = [];
  const placeIds: number[] = [];
  const latitude = -32.9;
  const longitude = -68.8;
  const gemini = {
    interpretIntent: jest.fn(),
    composePlans: jest.fn(),
  };
  const maps = { calculateRoute: jest.fn() };

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    db = app.get(DataSource);
    await seedInitialData(db);
    engine = new PlanGenerationService(
      db.getRepository(PlanRequest),
      db.getRepository(Plan),
      db,
      gemini as unknown as GeminiClientService,
      maps as unknown as GoogleMapsClientService,
      app.get(GeographicResolutionService),
      app.get(UserPreferenceProfileLookupService),
    );
    const country = await db
      .getRepository(Country)
      .save({ name: 'Preferences country' });
    const city = await db
      .getRepository(City)
      .save({ name: 'Preferences city', idCountry: country.id });
    countryId = country.id;
    cityId = city.id;
    department = await db
      .getRepository(Department)
      .save({ name: 'Preferences department', idCity: city.id });
    otherDepartment = await db
      .getRepository(Department)
      .save({ name: 'Other department', idCity: city.id });
    const active = await db
      .getRepository(CategoryStatus)
      .findOneByOrFail({ key: 'active' });
    category = await db
      .getRepository(Category)
      .save({ name: 'Preference interest', idCategoryStatus: active.id });
    otherCategory = await db
      .getRepository(Category)
      .save({ name: 'Explicit interest', idCategoryStatus: active.id });
    nearIds = [];
    for (const [index, offset, idCategory] of [
      [0, 0, category.id],
      [1, 0.001, category.id],
      [2, 0.1, category.id],
      [3, 0.002, otherCategory.id],
    ]) {
      const activity = await db.getRepository(Activity).save({
        name: `Preference activity ${index}`,
        description: 'Test activity',
        estimatedCost: 100,
        estimatedDuration: 30,
      });
      const place = await db.getRepository(Place).save({
        name: `Preference place ${index}`,
        address: 'Test address',
        idDepartment: department.id,
      });
      activityIds.push(activity.id);
      placeIds.push(place.id);
      await db.getRepository(ActivityPlace).save({
        idActivity: activity.id,
        idPlace: place.id,
        latitude: latitude + offset,
        longitude,
      });
      await db
        .getRepository(ActivityCategory)
        .save({ idActivity: activity.id, idCategory });
      if (index < 2) nearIds.push(activity.id);
      // A second venue outside the radius must not displace the in-range coordinates.
      if (index === 0) {
        const farPlace = await db.getRepository(Place).save({
          name: 'Second distant venue',
          address: 'Distant address',
          idDepartment: department.id,
        });
        placeIds.push(farPlace.id);
        await db.getRepository(ActivityPlace).save({
          idActivity: activity.id,
          idPlace: farPlace.id,
          latitude: latitude - 0.2,
          longitude: longitude - 0.2,
        });
      }
    }
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await db.getRepository(AuditLog).delete({ idActor: In(userIds) });
        await db.getRepository(User).delete(userIds);
      }
      if (activityIds.length > 0)
        await db.getRepository(Activity).delete(activityIds);
      if (placeIds.length > 0) await db.getRepository(Place).delete(placeIds);
      await db.getRepository(Category).delete([category.id, otherCategory.id]);
      await db
        .getRepository(Department)
        .delete([department.id, otherDepartment.id]);
      await db.getRepository(City).delete(cityId);
      await db.getRepository(Country).delete(countryId);
    } finally {
      await app.close();
    }
  });

  beforeEach(async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Preferences',
        lastName: 'Tester',
        email: `preferences-${Date.now()}@example.com`,
        password: 'TestPassword1!',
      })
      .expect(201);
    const authentication = registration.body as {
      accessToken: string;
      user: { id: number };
    };
    token = authentication.accessToken;
    userIds.push(authentication.user.id);
    gemini.interpretIntent.mockReset().mockResolvedValue({
      budget: null,
      departmentName: null,
      categoryNames: [],
      partySize: null,
      availableDuration: null,
    });
    gemini.composePlans
      .mockReset()
      .mockImplementation(({ candidates }: { candidates: { id: number }[] }) =>
        Promise.resolve([
          {
            title: 'Preference plan',
            description: 'Controlled generated alternative',
            activities: candidates.slice(0, 2).map((candidate, index) => ({
              activityId: candidate.id,
              order: index + 1,
            })),
          },
        ]),
      );
    maps.calculateRoute
      .mockReset()
      .mockResolvedValue({ distanceMeters: 100, durationSeconds: 60 });
  });

  async function savePreferences(overrides: Record<string, unknown> = {}) {
    await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryIds: [category.id],
        usualBudget: 1000,
        usualPeopleCount: 3,
        preferredArea: {
          label: 'Saved area',
          placeId: 'test-place',
          latitude,
          longitude,
        },
        useDeviceLocation: false,
        maxDistanceKm: 1,
        ...overrides,
      })
      .expect(200);
  }

  async function create(
    context?: Record<string, unknown>,
    surprise = false,
  ): Promise<PlanRequest> {
    const response = await request(app.getHttpServer())
      .post(surprise ? '/api/plan-requests/surprise' : '/api/plan-requests')
      .set('Authorization', `Bearer ${token}`)
      .send(surprise ? {} : { query: 'A pleasant outing', context })
      .expect(202);
    return db
      .getRepository(PlanRequest)
      .findOneByOrFail({ id: (response.body as { id: number }).id });
  }

  async function status(id: number) {
    return request(app.getHttpServer())
      .get(`/api/plan-requests/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  it.each([false, true])(
    'uses stored interests and radius through to generated results (surprise=%s)',
    async (surprise) => {
      await savePreferences();
      const resolved = await engine.resolveIntent(
        await create(undefined, surprise),
      );
      expect(resolved).toMatchObject({
        budget: 1000,
        partySize: 3,
        appliedMaxDistanceKm: 1,
        resolvedLatitude: latitude,
        resolvedLongitude: longitude,
      });
      const candidates = await engine.findCandidateActivities(resolved);
      expect(candidates.map(({ id }) => id).sort()).toEqual(
        [...nearIds].sort(),
      );
      expect(candidates.find(({ id }) => id === nearIds[0])).toMatchObject({
        latitude,
        longitude,
      });
      await engine.composeAndPersistPlans(resolved);
      const response = await status(resolved.id);
      expect(response.body).toMatchObject({
        statusKey: 'generated',
        resolvedContext: {
          budget: 1000,
          partySize: 3,
          appliedMaxDistanceKm: 1,
          categories: [{ id: category.id }],
        },
      });
      expect((response.body as { plans: unknown[] }).plans).toHaveLength(1);
      const result = response.body as {
        plans: {
          details: {
            activity: {
              id: number;
              locations: { latitude: number; longitude: number }[];
            };
          }[];
        }[];
      };
      const activity = result.plans[0].details.find(
        ({ activity }) => activity.id === nearIds[0],
      )?.activity;
      expect(activity?.locations).toHaveLength(1);
      expect(activity?.locations[0]).toMatchObject({ latitude, longitude });
    },
  );

  it('keeps explicit context ahead of Gemini and saved preferences', async () => {
    await savePreferences();
    gemini.interpretIntent.mockResolvedValueOnce({
      budget: 9999,
      departmentName: department.name,
      categoryNames: [otherCategory.name],
      partySize: 9,
      availableDuration: 999,
    });
    const resolved = await engine.resolveIntent(
      await create({ budget: 500, partySize: 2, availableDuration: 90 }),
    );
    expect(resolved).toMatchObject({
      budget: 500,
      partySize: 2,
      availableDuration: 90,
    });
    const response = await status(resolved.id);
    expect(response.body).toMatchObject({
      resolvedContext: { categories: [{ id: otherCategory.id }] },
    });
    expect(await engine.findCandidateActivities(resolved)).toHaveLength(1);
  });

  it('filters candidates immediately inside and outside the radius boundary', async () => {
    await savePreferences();
    const resolved = await engine.resolveIntent(await create());
    const location = await db
      .getRepository(ActivityPlace)
      .findOneByOrFail({ idActivity: nearIds[1] });
    try {
      const degreesPerKm = 180 / (6371 * Math.PI);
      await db
        .getRepository(ActivityPlace)
        .update(location.id, { latitude: latitude + degreesPerKm * 0.999 });
      expect(
        (await engine.findCandidateActivities(resolved)).map(({ id }) => id),
      ).toContain(nearIds[1]);
      await db
        .getRepository(ActivityPlace)
        .update(location.id, { latitude: latitude + degreesPerKm * 1.001 });
      expect(
        (await engine.findCandidateActivities(resolved)).map(({ id }) => id),
      ).not.toContain(nearIds[1]);
    } finally {
      await db
        .getRepository(ActivityPlace)
        .update(location.id, { latitude: location.latitude });
    }
  });

  it('never combines a partial request coordinate with a saved coordinate', async () => {
    await savePreferences();
    const resolved = await engine.resolveIntent(
      await create({ latitude: latitude + 0.1 }),
    );
    expect(resolved).toMatchObject({
      resolvedLatitude: null,
      resolvedLongitude: null,
      appliedMaxDistanceKm: null,
    });
  });

  it('does not apply the saved area radius to a different explicitly requested department', async () => {
    await savePreferences();
    const resolved = await engine.resolveIntent(
      await create({ idDepartment: otherDepartment.id }),
    );
    expect(resolved).toMatchObject({
      idDepartment: otherDepartment.id,
      appliedMaxDistanceKm: null,
      resolvedLatitude: null,
      resolvedLongitude: null,
    });
    expect(await engine.findCandidateActivities(resolved)).toEqual([]);
  });

  it('preserves the resolved preference snapshot on a retry', async () => {
    await savePreferences();
    const resolved = await engine.resolveIntent(await create());
    await savePreferences({
      categoryIds: [otherCategory.id],
      usualBudget: 9000,
      maxDistanceKm: 20,
    });
    expect(await engine.resolveIntent(resolved)).toEqual(resolved);
    expect(await engine.findCandidateActivities(resolved)).toHaveLength(2);
    expect(gemini.interpretIntent).toHaveBeenCalledTimes(1);
  });

  it('uses defaults with an empty profile and omits an unapplied radius', async () => {
    const resolved = await engine.resolveIntent(await create());
    expect(resolved).toMatchObject({
      budget: null,
      partySize: null,
      appliedMaxDistanceKm: null,
    });
    const response = await status(resolved.id);
    expect(response.body).toMatchObject({
      resolvedContext: { categories: [], appliedMaxDistanceKm: null },
    });
  });

  it('omits the radius without usable coordinates', async () => {
    await savePreferences({ preferredArea: null });
    const resolved = await engine.resolveIntent(await create());
    expect(resolved.appliedMaxDistanceKm).toBeNull();
  });

  it('ignores inactive saved interests', async () => {
    await savePreferences();
    const inactive = await db
      .getRepository(CategoryStatus)
      .findOneByOrFail({ key: 'inactive' });
    const active = await db
      .getRepository(CategoryStatus)
      .findOneByOrFail({ key: 'active' });
    await db
      .getRepository(Category)
      .update(category.id, { idCategoryStatus: inactive.id });
    try {
      const resolved = await engine.resolveIntent(await create());
      expect((await status(resolved.id)).body).toMatchObject({
        resolvedContext: { categories: [] },
      });
    } finally {
      await db
        .getRepository(Category)
        .update(category.id, { idCategoryStatus: active.id });
    }
  });

  it('does not widen an empty radius or discard historical requests during migration', async () => {
    await savePreferences({
      preferredArea: {
        label: 'Far area',
        placeId: 'far',
        latitude: latitude + 0.3,
        longitude,
      },
    });
    const resolved = await engine.resolveIntent(await create());
    expect(await engine.findCandidateActivities(resolved)).toEqual([]);
    await expect(engine.composeAndPersistPlans(resolved)).rejects.toThrow(
      'NO_VALID_COMBINATIONS',
    );
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new AddGenerationSearchRadius1791817200000();
      await migration.down(runner);
      await migration.up(runner);
      const rows: unknown = await runner.query(
        'SELECT id, applied_max_distance_km FROM plan_request WHERE id = $1',
        [resolved.id],
      );
      expect(rows).toEqual([
        { id: resolved.id, applied_max_distance_km: null },
      ]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
