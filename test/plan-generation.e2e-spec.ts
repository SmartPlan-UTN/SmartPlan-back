import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { validateWorkerEnvironment } from '../src/config/worker-environment-variables';
import { DatabaseModule } from '../src/database/database.module';
import { seedInitialData } from '../src/database/seeds/seed';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Category } from '../src/categories/entities/category.entity';
import { CategoryStatus } from '../src/categories/entities/category-status.entity';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { PlanGenerationService } from '../src/recommendation/plan-generation.service';
import {
  PlanRequest,
  PlanRequestMode,
} from '../src/recommendation/entities/plan-request.entity';
import { PlanRequestCategory } from '../src/recommendation/entities/plan-request-category.entity';
import { User } from '../src/users/entities/user.entity';
import { UserPreference } from '../src/users/entities/user-preference.entity';
import { UserPreferenceProfile } from '../src/users/entities/user-preference-profile.entity';
import { USER_ROLE } from '../src/database/seeds/definitions';

describe('PlanGenerationService.claim concurrency (real Postgres)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let service: PlanGenerationService;
  let userId: number;
  let departmentId: number;
  let cityId: number;
  let countryId: number;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          validate: validateWorkerEnvironment,
        }),
        DatabaseModule,
        TypeOrmModule.forFeature([
          Activity,
          ActivityCategory,
          ActivityPlace,
          Category,
          CategoryStatus,
          Country,
          City,
          Department,
          Place,
          Plan,
          PlanDetail,
          PlanRequest,
          PlanRequestCategory,
          UserPreference,
        ]),
      ],
      providers: [
        PlanGenerationService,
        {
          provide: GeminiClientService,
          useValue: { interpretIntent: jest.fn(), composePlans: jest.fn() },
        },
        {
          provide: GoogleMapsClientService,
          useValue: { calculateRoute: jest.fn() },
        },
      ],
    }).compile();

    dataSource = module.get(DataSource);
    service = module.get(PlanGenerationService);
    await seedInitialData(dataSource);

    const country = await dataSource
      .getRepository(Country)
      .save(
        dataSource
          .getRepository(Country)
          .create({ name: 'Argentina', description: null }),
      );
    const city = await dataSource.getRepository(City).save(
      dataSource.getRepository(City).create({
        idCountry: country.id,
        name: 'Mendoza',
        description: null,
      }),
    );
    const department = await dataSource.getRepository(Department).save(
      dataSource.getRepository(Department).create({
        idCity: city.id,
        name: 'Godoy Cruz',
        description: null,
      }),
    );
    departmentId = department.id;
    cityId = city.id;
    countryId = country.id;

    const role = await dataSource
      .createQueryBuilder()
      .select('role.id', 'id')
      .from('role', 'role')
      .where('role.key = :key', { key: USER_ROLE })
      .getRawOne<{ id: number }>();
    const userStatus = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('user_status', 'status')
      .where('status.key = :key', { key: 'active' })
      .getRawOne<{ id: number }>();

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        name: 'Test',
        lastName: 'Concurrency',
        email: `plan-generation-${Date.now()}@example.com`,
        passwordHash: 'hashed-value-not-used',
        idRole: role?.id,
        idUserStatus: userStatus?.id,
      }),
    );
    userId = user.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await dataSource.getRepository(Department).delete(departmentId);
    await dataSource.getRepository(City).delete(cityId);
    await dataSource.getRepository(Country).delete(countryId);
    await module.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(PlanRequest).deleteAll();
  });

  async function pendingStatusId(): Promise<number> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key: 'pending' })
      .getRawOne<{ id: number }>();
    if (!status) throw new Error('Missing pending request_status seed');
    return status.id;
  }

  async function createPendingRequest(): Promise<number> {
    const repository = dataSource.getRepository(PlanRequest);
    const saved = await repository.save(
      repository.create({
        idUser: userId,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo tranquilo',
        idRequestStatus: await pendingStatusId(),
        idDepartment: departmentId,
        requestedAt: new Date(),
      }),
    );
    return saved.id;
  }

  it('only lets one of two concurrent claim() calls win the pessimistic lock', async () => {
    const planRequestId = await createPendingRequest();

    const [first, second] = await Promise.all([
      service.claim(planRequestId),
      service.claim(planRequestId),
    ]);

    const results = [first, second].sort();
    expect(results).toEqual(['claimed', 'skip']);

    const stored = await dataSource
      .getRepository(PlanRequest)
      .findOneOrFail({ where: { id: planRequestId } });
    expect(stored.processingStartedAt).not.toBeNull();
  });

  it('re-claims a stale processing request whose worker died before persisting a plan', async () => {
    const planRequestId = await createPendingRequest();
    const processingStatusId = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key: 'processing' })
      .getRawOne<{ id: number }>();
    await dataSource.getRepository(PlanRequest).update(planRequestId, {
      idRequestStatus: processingStatusId?.id,
      processingStartedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await expect(service.claim(planRequestId)).resolves.toBe('claimed');

    const stored = await dataSource
      .getRepository(PlanRequest)
      .findOneOrFail({ where: { id: planRequestId } });
    expect(stored.processingStartedAt?.getTime()).toBeGreaterThan(
      Date.now() - 60 * 1000,
    );
  });

  it('skips a processing request whose slot is still fresh', async () => {
    const planRequestId = await createPendingRequest();
    const processingStatusId = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key: 'processing' })
      .getRawOne<{ id: number }>();
    await dataSource.getRepository(PlanRequest).update(planRequestId, {
      idRequestStatus: processingStatusId?.id,
      processingStartedAt: new Date(),
    });

    await expect(service.claim(planRequestId)).resolves.toBe('skip');
  });

  it('finalizes a stuck request to generated when a Plan already exists but the status is pending', async () => {
    const planRequestId = await createPendingRequest();
    const planStatus = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key: 'generated' })
      .getRawOne<{ id: number }>();
    await dataSource.getRepository(Plan).save(
      dataSource.getRepository(Plan).create({
        idUser: userId,
        idPlanRequest: planRequestId,
        idPlanStatus: planStatus?.id,
        title: 'Persisted before crash',
        description: 'desc',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
      }),
    );

    await expect(service.claim(planRequestId)).resolves.toBe('terminal');

    const stored = await dataSource.getRepository(PlanRequest).findOneOrFail({
      where: { id: planRequestId },
      relations: { status: true },
    });
    expect(stored.status.key).toBe('generated');

    await dataSource
      .getRepository(Plan)
      .delete({ idPlanRequest: planRequestId });
  });

  it('reports terminal for a request whose status is already generated', async () => {
    const planRequestId = await createPendingRequest();
    const generatedStatusId = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key: 'generated' })
      .getRawOne<{ id: number }>();

    await dataSource.getRepository(PlanRequest).update(planRequestId, {
      idRequestStatus: generatedStatusId?.id,
    });

    await expect(service.claim(planRequestId)).resolves.toBe('terminal');
  });

  it('reports terminal when a Plan already exists for the request, regardless of status', async () => {
    const planRequestId = await createPendingRequest();
    const planStatus = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key: 'generated' })
      .getRawOne<{ id: number }>();

    await dataSource.getRepository(Plan).save(
      dataSource.getRepository(Plan).create({
        idUser: userId,
        idPlanRequest: planRequestId,
        idPlanStatus: planStatus?.id,
        title: 'Existing plan',
        description: 'desc',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
      }),
    );

    await expect(service.claim(planRequestId)).resolves.toBe('terminal');

    await dataSource
      .getRepository(Plan)
      .delete({ idPlanRequest: planRequestId });
  });

  describe('candidate search and composition (real Postgres)', () => {
    let placeId: number;
    let inMatchingDepartmentActivityId: number;
    let inOtherDepartmentActivityId: number;
    let matchingActivityPlaceId: number;
    let otherActivityPlaceId: number;
    let otherDepartmentId: number;
    let otherPlaceId: number;
    let categoryId: number;
    let categoryName: string;
    let categoryLinkId: number;

    beforeAll(async () => {
      const categoryStatus = await dataSource
        .createQueryBuilder()
        .select('status.id', 'id')
        .from('category_status', 'status')
        .where('status.key = :key', { key: 'active' })
        .getRawOne<{ id: number }>();

      categoryName = `Test category ${Date.now()}`;
      const category = await dataSource.getRepository(Category).save(
        dataSource.getRepository(Category).create({
          name: categoryName,
          description: null,
          idCategoryStatus: categoryStatus?.id,
        }),
      );
      categoryId = category.id;

      const place = await dataSource.getRepository(Place).save(
        dataSource.getRepository(Place).create({
          idDepartment: departmentId,
          name: 'Winery in scope',
          description: null,
          address: 'Street 1',
        }),
      );
      placeId = place.id;

      const otherDepartment = await dataSource.getRepository(Department).save(
        dataSource.getRepository(Department).create({
          idCity: cityId,
          name: 'Other department',
          description: null,
        }),
      );
      otherDepartmentId = otherDepartment.id;
      const otherPlace = await dataSource.getRepository(Place).save(
        dataSource.getRepository(Place).create({
          idDepartment: otherDepartment.id,
          name: 'Winery out of scope',
          description: null,
          address: 'Street 2',
        }),
      );
      otherPlaceId = otherPlace.id;

      const inScopeActivity = await dataSource.getRepository(Activity).save(
        dataSource.getRepository(Activity).create({
          name: 'Wine tasting',
          description: 'desc',
          estimatedCost: 15000,
          estimatedDuration: 90,
        }),
      );
      inMatchingDepartmentActivityId = inScopeActivity.id;
      const outOfScopeActivity = await dataSource.getRepository(Activity).save(
        dataSource.getRepository(Activity).create({
          name: 'Activity elsewhere',
          description: 'desc',
          estimatedCost: 5000,
          estimatedDuration: 60,
        }),
      );
      inOtherDepartmentActivityId = outOfScopeActivity.id;

      const matchingActivityPlace = await dataSource
        .getRepository(ActivityPlace)
        .save(
          dataSource.getRepository(ActivityPlace).create({
            idActivity: inScopeActivity.id,
            idPlace: place.id,
          }),
        );
      matchingActivityPlaceId = matchingActivityPlace.id;
      const otherActivityPlace = await dataSource
        .getRepository(ActivityPlace)
        .save(
          dataSource.getRepository(ActivityPlace).create({
            idActivity: outOfScopeActivity.id,
            idPlace: otherPlace.id,
          }),
        );
      otherActivityPlaceId = otherActivityPlace.id;

      const categoryLink = await dataSource
        .getRepository(ActivityCategory)
        .save(
          dataSource.getRepository(ActivityCategory).create({
            idActivity: inScopeActivity.id,
            idCategory: category.id,
          }),
        );
      categoryLinkId = categoryLink.id;
    });

    afterAll(async () => {
      await dataSource.getRepository(ActivityCategory).delete(categoryLinkId);
      await dataSource
        .getRepository(ActivityPlace)
        .delete(matchingActivityPlaceId);
      await dataSource
        .getRepository(ActivityPlace)
        .delete(otherActivityPlaceId);
      await dataSource
        .getRepository(Activity)
        .delete(inMatchingDepartmentActivityId);
      await dataSource
        .getRepository(Activity)
        .delete(inOtherDepartmentActivityId);
      await dataSource.getRepository(Place).delete(placeId);
      await dataSource.getRepository(Place).delete(otherPlaceId);
      await dataSource.getRepository(Department).delete(otherDepartmentId);
      await dataSource.getRepository(Category).delete(categoryId);
    });

    it('finds only activities located in the resolved department', async () => {
      const planRequest = {
        id: -1,
        idDepartment: departmentId,
      } as PlanRequest;

      const candidates = await service.findCandidateActivities(planRequest);

      const ids = candidates.map((candidate) => candidate.id);
      expect(ids).toContain(inMatchingDepartmentActivityId);
      expect(ids).not.toContain(inOtherDepartmentActivityId);
    });

    it('includes resolved category names on each candidate', async () => {
      const planRequest = {
        id: -1,
        idDepartment: departmentId,
      } as PlanRequest;

      const candidates = await service.findCandidateActivities(planRequest);

      const match = candidates.find(
        (candidate) => candidate.id === inMatchingDepartmentActivityId,
      );
      expect(match?.categoryNames).toEqual([categoryName]);
    });

    it('persists a real Plan and PlanDetail rows from a composed plan referencing real candidate ids', async () => {
      const planRequestId = await createPendingRequest();
      const planRequest = await dataSource
        .getRepository(PlanRequest)
        .findOneOrFail({ where: { id: planRequestId } });

      const gemini = module.get(GeminiClientService);
      jest.spyOn(gemini, 'composePlans').mockResolvedValue([
        {
          title: 'Tarde de vinos',
          description: 'Una tarde tranquila',
          activities: [
            { activityId: inMatchingDepartmentActivityId, order: 1 },
          ],
        },
      ]);

      await service.composeAndPersistPlans(planRequest);

      const persistedPlan = await dataSource.getRepository(Plan).findOneOrFail({
        where: { idPlanRequest: planRequestId },
        relations: { details: true },
      });
      expect(persistedPlan.title).toBe('Tarde de vinos');
      expect(persistedPlan.details).toHaveLength(1);
      expect(persistedPlan.details[0].idActivity).toBe(
        inMatchingDepartmentActivityId,
      );

      const updatedRequest = await dataSource
        .getRepository(PlanRequest)
        .findOneOrFail({
          where: { id: planRequestId },
          relations: { status: true },
        });
      expect(updatedRequest.status.key).toBe('generated');

      await dataSource
        .getRepository(PlanDetail)
        .delete({ idPlan: persistedPlan.id });
      await dataSource.getRepository(Plan).delete(persistedPlan.id);
    });

    it('throws NO_VALID_COMBINATIONS when there are no candidates in the resolved department', async () => {
      const isolatedDepartment = await dataSource
        .getRepository(Department)
        .save(
          dataSource.getRepository(Department).create({
            idCity: cityId,
            name: 'Empty department',
            description: null,
          }),
        );

      const planRequest = {
        id: -2,
        idDepartment: isolatedDepartment.id,
        idUser: userId,
        rawQuery: 'algo',
        budget: 1000,
        availableDuration: 60,
      } as PlanRequest;

      await expect(
        service.composeAndPersistPlans(planRequest),
      ).rejects.toMatchObject({
        message: expect.stringContaining('NO_VALID_COMBINATIONS') as string,
      });

      await dataSource.getRepository(Department).delete(isolatedDepartment.id);
    });

    it('resolves surprise categories from real UserPreference rows (CU19)', async () => {
      const preference = await dataSource.getRepository(UserPreference).save(
        dataSource.getRepository(UserPreference).create({
          idUser: userId,
          idCategory: categoryId,
        }),
      );

      const planRequestId = await createPendingRequest();
      const pendingRequest = await dataSource
        .getRepository(PlanRequest)
        .findOneOrFail({ where: { id: planRequestId } });
      pendingRequest.mode = PlanRequestMode.Surprise;

      const resolved = await service.resolveIntent(pendingRequest);

      const linkedCategories = await dataSource
        .getRepository(PlanRequestCategory)
        .find({ where: { idPlanRequest: resolved.id } });
      expect(linkedCategories.map((link) => link.idCategory)).toEqual([
        categoryId,
      ]);

      await dataSource
        .getRepository(PlanRequestCategory)
        .delete({ idPlanRequest: resolved.id });
      await dataSource.getRepository(UserPreference).delete(preference.id);
    });
  });

  describe('surprise distance filter (CU19, real Postgres)', () => {
    // Reference point the surprise request is made from.
    const originLatitude = -32.9;
    const originLongitude = -68.84;

    let profileDepartmentId: number;
    let nearPlaceId: number;
    let farPlaceId: number;
    let nearActivityId: number;
    let farActivityId: number;
    let nearActivityPlaceId: number;
    let farActivityPlaceId: number;

    beforeAll(async () => {
      const department = await dataSource.getRepository(Department).save(
        dataSource.getRepository(Department).create({
          idCity: cityId,
          name: `Distance department ${Date.now()}`,
          description: null,
        }),
      );
      profileDepartmentId = department.id;

      const nearPlace = await dataSource.getRepository(Place).save(
        dataSource.getRepository(Place).create({
          idDepartment: department.id,
          name: 'Near place',
          description: null,
          address: 'Near street',
        }),
      );
      nearPlaceId = nearPlace.id;
      const farPlace = await dataSource.getRepository(Place).save(
        dataSource.getRepository(Place).create({
          idDepartment: department.id,
          name: 'Far place',
          description: null,
          address: 'Far street',
        }),
      );
      farPlaceId = farPlace.id;

      const nearActivity = await dataSource.getRepository(Activity).save(
        dataSource.getRepository(Activity).create({
          name: 'Near activity',
          description: 'desc',
          estimatedCost: 1000,
          estimatedDuration: 30,
        }),
      );
      nearActivityId = nearActivity.id;
      const farActivity = await dataSource.getRepository(Activity).save(
        dataSource.getRepository(Activity).create({
          name: 'Far activity',
          description: 'desc',
          estimatedCost: 1000,
          estimatedDuration: 30,
        }),
      );
      farActivityId = farActivity.id;

      const nearActivityPlace = await dataSource
        .getRepository(ActivityPlace)
        .save(
          dataSource.getRepository(ActivityPlace).create({
            idActivity: nearActivity.id,
            idPlace: nearPlace.id,
            latitude: originLatitude,
            longitude: originLongitude,
          }),
        );
      nearActivityPlaceId = nearActivityPlace.id;
      // ~33 km south of the origin (0.3° of latitude).
      const farActivityPlace = await dataSource
        .getRepository(ActivityPlace)
        .save(
          dataSource.getRepository(ActivityPlace).create({
            idActivity: farActivity.id,
            idPlace: farPlace.id,
            latitude: originLatitude - 0.3,
            longitude: originLongitude,
          }),
        );
      farActivityPlaceId = farActivityPlace.id;
    });

    afterAll(async () => {
      await dataSource
        .getRepository(UserPreferenceProfile)
        .delete({ idUser: userId });
      await dataSource.getRepository(ActivityPlace).delete(nearActivityPlaceId);
      await dataSource.getRepository(ActivityPlace).delete(farActivityPlaceId);
      await dataSource.getRepository(Activity).delete(nearActivityId);
      await dataSource.getRepository(Activity).delete(farActivityId);
      await dataSource.getRepository(Place).delete(nearPlaceId);
      await dataSource.getRepository(Place).delete(farPlaceId);
      await dataSource.getRepository(Department).delete(profileDepartmentId);
    });

    afterEach(async () => {
      await dataSource
        .getRepository(UserPreferenceProfile)
        .delete({ idUser: userId });
    });

    const surpriseRequest = () =>
      ({
        id: -100,
        idUser: userId,
        idDepartment: profileDepartmentId,
        mode: PlanRequestMode.Surprise,
        rawContext: {
          latitude: originLatitude,
          longitude: originLongitude,
        },
      }) as unknown as PlanRequest;

    async function setMaxDistanceKm(
      maxDistanceKm: number | null,
    ): Promise<void> {
      await dataSource.getRepository(UserPreferenceProfile).save(
        dataSource.getRepository(UserPreferenceProfile).create({
          idUser: userId,
          maxDistanceKm,
        }),
      );
    }

    it('keeps only activities within maxDistanceKm of the request origin', async () => {
      await setMaxDistanceKm(20);

      const ids = (
        await service.findCandidateActivities(surpriseRequest())
      ).map((candidate) => candidate.id);

      expect(ids).toContain(nearActivityId);
      expect(ids).not.toContain(farActivityId);
    });

    it('applies no distance filter when maxDistanceKm is null', async () => {
      await setMaxDistanceKm(null);

      const ids = (
        await service.findCandidateActivities(surpriseRequest())
      ).map((candidate) => candidate.id);

      expect(ids).toEqual(
        expect.arrayContaining([nearActivityId, farActivityId]),
      );
    });

    it('applies no distance filter when the user has no preference profile', async () => {
      const ids = (
        await service.findCandidateActivities(surpriseRequest())
      ).map((candidate) => candidate.id);

      expect(ids).toEqual(
        expect.arrayContaining([nearActivityId, farActivityId]),
      );
    });

    it('does not filter automatic requests by distance even with a profile radius', async () => {
      await setMaxDistanceKm(1);

      const automaticRequest = {
        ...surpriseRequest(),
        mode: PlanRequestMode.Automatic,
        rawContext: null,
      } as unknown as PlanRequest;

      const ids = (await service.findCandidateActivities(automaticRequest)).map(
        (candidate) => candidate.id,
      );

      expect(ids).toEqual(
        expect.arrayContaining([nearActivityId, farActivityId]),
      );
    });

    it('fails generation with NO_VALID_COMBINATIONS when the radius leaves fewer than two activities', async () => {
      await setMaxDistanceKm(5);

      await expect(
        service.composeAndPersistPlans(surpriseRequest()),
      ).rejects.toMatchObject({
        message: expect.stringContaining('NO_VALID_COMBINATIONS') as string,
      });
    });
  });
});
