import { fixedPrice } from '../common/pricing/price.fixtures';
import { DataSource, Repository } from 'typeorm';
import { Plan } from '../plans/entities/plan.entity';
import { RetryableJobError } from '../messaging/errors/retryable-job-error';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { GoogleMapsClientService } from '../external-integration/google-maps/google-maps-client.service';
import { Category } from '../categories/entities/category.entity';
import { Department } from '../places/entities/department.entity';
import { UserPreference } from '../users/entities/user-preference.entity';
import { UserPreferenceProfile } from '../users/entities/user-preference-profile.entity';
import { UserPreferenceProfileLookupService } from '../users/user-preference-profile-lookup.service';
import { GeminiClientService } from './gemini/gemini-client.service';
import { GeographicResolutionService } from './geographic-resolution.service';
import { PlanGenerationService } from './plan-generation.service';
import { PlanRequest, PlanRequestMode } from './entities/plan-request.entity';
import { PlanRequestCategory } from './entities/plan-request-category.entity';
import { CandidateActivity } from './dto/candidate-activity.dto';
import { withinGenerationDeadline } from './generation-deadline';

describe('PlanGenerationService', () => {
  let service: PlanGenerationService;
  let planRequests: jest.Mocked<
    Pick<Repository<PlanRequest>, 'manager' | 'update' | 'createQueryBuilder'>
  >;
  let plans: jest.Mocked<Pick<Repository<Plan>, 'count'>>;
  let dataSource: jest.Mocked<
    Pick<DataSource, 'transaction' | 'getRepository'>
  >;
  let gemini: jest.Mocked<
    Pick<GeminiClientService, 'interpretIntent' | 'composePlans'>
  >;
  let googleMaps: jest.Mocked<Pick<GoogleMapsClientService, 'calculateRoute'>>;
  let geographicResolution: jest.Mocked<
    Pick<
      GeographicResolutionService,
      'nearestDepartment' | 'departmentWithMostActiveCandidates'
    >
  >;
  let preferenceProfiles: jest.Mocked<
    Pick<UserPreferenceProfileLookupService, 'findByUser'>
  >;

  let transactionManager: {
    createQueryBuilder: jest.Mock;
    query: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    getRepository: jest.Mock;
    findOneOrFail: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let requestQueryBuilder: {
    setLock: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let statusQueryBuilder: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };

  function chainableBuilder(rows: unknown[]) {
    return {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
      setParameters: jest.fn().mockReturnThis(),
      addCommonTableExpression: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
  }

  /** No requested categories -> `findCandidateActivities` skips its early
   *  return and never adds the category join, keeping the activity query
   *  builder mock simple for tests that don't care about categories. */
  function stubNoRequestedCategories() {
    dataSource.getRepository.mockImplementation((entity) => {
      if (entity === PlanRequestCategory) {
        return {
          createQueryBuilder: jest.fn().mockReturnValue(chainableBuilder([])),
        } as never;
      }
      return {} as never;
    });
  }

  function activeCategoryQuery<T>(result: T, method: 'getMany' | 'getRawMany') {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(method === 'getMany' ? result : []),
      getRawMany: jest
        .fn()
        .mockResolvedValue(method === 'getRawMany' ? result : []),
    };
  }

  const statusIdByKey: Record<string, number> = {
    pending: 1,
    processing: 2,
    generated: 3,
    failed: 4,
  };
  const planStatusIdByKey: Record<string, number> = {
    generated: 30,
    selected: 31,
  };

  beforeEach(() => {
    requestQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ status: { key: 'processing' } }),
    };

    statusQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockImplementation(function (
        this: typeof statusQueryBuilder,
        table: string,
      ) {
        (this as unknown as { __table: string }).__table = table;
        return this;
      }),
      where: jest.fn().mockImplementation(function (
        this: typeof statusQueryBuilder,
        _clause: string,
        params: { key: string },
      ) {
        (this as unknown as { __key: string }).__key = params.key;
        return this;
      }),
      getRawOne: jest.fn().mockImplementation(function (
        this: typeof statusQueryBuilder,
      ) {
        const key = (this as unknown as { __key: string }).__key;
        const table = (this as unknown as { __table: string }).__table;
        const id =
          table === 'plan_status' ? planStatusIdByKey[key] : statusIdByKey[key];
        return Promise.resolve(id ? { id } : undefined);
      }),
    };

    transactionManager = {
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn((entity?: unknown) => {
        if (entity === undefined) return statusQueryBuilder;
        return requestQueryBuilder;
      }),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue({
        create: jest.fn((entity: unknown) => entity),
        save: jest.fn().mockResolvedValue(undefined),
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(statusQueryBuilder),
        },
      }),
      findOneOrFail: jest.fn(),
      save: jest.fn().mockResolvedValue({ id: 99 }),
      create: jest.fn((_entity: unknown, data: unknown) => data),
    };

    planRequests = {
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
      update: jest.fn().mockResolvedValue(undefined),
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(statusQueryBuilder),
      } as unknown as Repository<PlanRequest>['manager'],
    };

    plans = { count: jest.fn().mockResolvedValue(0) };

    dataSource = {
      transaction: jest.fn(
        (runInTransaction: (manager: typeof transactionManager) => unknown) =>
          Promise.resolve(runInTransaction(transactionManager)),
      ),
      getRepository: jest
        .fn()
        .mockReturnValue({ find: jest.fn().mockResolvedValue([]) }),
    };

    gemini = { interpretIntent: jest.fn(), composePlans: jest.fn() };
    googleMaps = { calculateRoute: jest.fn() };
    geographicResolution = {
      nearestDepartment: jest.fn().mockResolvedValue(null),
      departmentWithMostActiveCandidates: jest.fn().mockResolvedValue(99),
    };
    preferenceProfiles = { findByUser: jest.fn().mockResolvedValue(null) };

    service = new PlanGenerationService(
      planRequests as unknown as Repository<PlanRequest>,
      plans as unknown as Repository<Plan>,
      dataSource as unknown as DataSource,
      gemini as unknown as GeminiClientService,
      googleMaps as unknown as GoogleMapsClientService,
      geographicResolution as unknown as GeographicResolutionService,
      preferenceProfiles as unknown as UserPreferenceProfileLookupService,
    );
  });

  describe('claim', () => {
    it('claims a pending request and marks it processing', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(),
        status: { key: 'pending' },
      });

      const result = await service.claim(1);

      expect(result).toBe('claimed');
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ idRequestStatus: statusIdByKey.processing }),
      );
    });

    it('treats generated as terminal (no-op)', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(),
        status: { key: 'generated' },
      });

      await expect(service.claim(1)).resolves.toBe('terminal');
      expect(transactionManager.update).not.toHaveBeenCalled();
    });

    it('treats failed as terminal (no-op)', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(),
        status: { key: 'failed' },
      });

      await expect(service.claim(1)).resolves.toBe('terminal');
    });

    it('finalizes a stuck request to generated when Plans already exist but its status is still pending', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(),
        status: { key: 'pending' },
      });
      transactionManager.count.mockResolvedValue(1);

      await expect(service.claim(1)).resolves.toBe('terminal');
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ idRequestStatus: statusIdByKey.generated }),
      );
    });

    it('does not touch a request that already has Plans and is already generated', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(),
        status: { key: 'generated' },
      });
      transactionManager.count.mockResolvedValue(2);

      await expect(service.claim(1)).resolves.toBe('terminal');
      expect(transactionManager.update).not.toHaveBeenCalled();
    });

    it('skips (no-op) a request that another attempt is actively processing', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(),
        status: { key: 'processing' },
        processingStartedAt: new Date(),
      });

      await expect(service.claim(1)).resolves.toBe('skip');
      expect(transactionManager.update).not.toHaveBeenCalled();
    });

    it('rejects an expired processing request before any provider work', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(Date.now() - 30001),
        status: { key: 'processing' },
      });
      await expect(service.claim(1, true)).rejects.toThrow(
        'GENERATION_TIMEOUT',
      );
      expect(transactionManager.update).not.toHaveBeenCalled();
    });

    it('re-claims a fresh processing request on a RabbitMQ retry attempt', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        requestedAt: new Date(),
        status: { key: 'processing' },
        processingStartedAt: new Date(),
      });

      await expect(service.claim(1, true)).resolves.toBe('claimed');
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ idRequestStatus: statusIdByKey.processing }),
      );
    });

    it('throws a permanent error for a plan request that does not exist', async () => {
      requestQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.claim(999)).rejects.toThrow(PermanentJobError);
    });
  });

  describe('closeIfAlreadyGenerated', () => {
    it('returns false when expiration wins the conditional update (CU17/CU19)', async () => {
      plans.count.mockResolvedValue(2);
      const queryBuilder = planRequests.createQueryBuilder();
      jest
        .spyOn(queryBuilder, 'execute')
        .mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });
      await expect(service.closeIfAlreadyGenerated(1)).resolves.toBe(false);
    });

    it('returns false and does nothing when no Plan exists yet', async () => {
      plans.count.mockResolvedValue(0);

      await expect(service.closeIfAlreadyGenerated(1)).resolves.toBe(false);
    });

    it('marks the request generated without calling any provider when Plans already exist', async () => {
      plans.count.mockResolvedValue(2);
      const update = jest.fn().mockResolvedValue(undefined);
      (planRequests as unknown as { update: typeof update }).update = update;

      const result = await service.closeIfAlreadyGenerated(1);

      expect(result).toBe(true);
      expect(planRequests.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('findCandidateActivities', () => {
    it('returns no candidates when every requested category is inactive (CU54)', async () => {
      const requestedCategories = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ idCategory: 10, statusKey: 'inactive' }]),
      };
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === PlanRequestCategory) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(requestedCategories),
          } as never;
        }
        return {} as never;
      });

      await expect(
        service.findCandidateActivities({
          id: 1,
          requestedAt: new Date(),
          idDepartment: 5,
        } as PlanRequest),
      ).resolves.toEqual([]);
    });

    it('excludes an activity whose cost alone exceeds the budget from the query', async () => {
      stubNoRequestedCategories();
      const activityBuilder = chainableBuilder([]);
      const categoryNamesBuilder = chainableBuilder([]);
      (
        dataSource as unknown as { createQueryBuilder: jest.Mock }
      ).createQueryBuilder = jest
        .fn()
        .mockReturnValueOnce(activityBuilder)
        .mockReturnValueOnce(categoryNamesBuilder);

      await service.findCandidateActivities({
        id: 1,
        requestedAt: new Date(),
        idDepartment: 5,
        budget: 15000,
      } as PlanRequest);

      expect(activityBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('activity.price_min * CASE'),
        { budget: 15000 },
      );
    });

    it('does not filter by cost when the request has no budget', async () => {
      stubNoRequestedCategories();
      const activityBuilder = chainableBuilder([]);
      const categoryNamesBuilder = chainableBuilder([]);
      (
        dataSource as unknown as { createQueryBuilder: jest.Mock }
      ).createQueryBuilder = jest
        .fn()
        .mockReturnValueOnce(activityBuilder)
        .mockReturnValueOnce(categoryNamesBuilder);

      await service.findCandidateActivities({
        id: 1,
        requestedAt: new Date(),
        idDepartment: 5,
        budget: null,
      } as PlanRequest);

      expect(activityBuilder.andWhere).not.toHaveBeenCalledWith(
        '(activity.price_min IS NULL OR activity.price_min <= :budget)',
        expect.anything(),
      );
    });

    it('caps the candidate list when more activities match than the cap allows', async () => {
      stubNoRequestedCategories();
      const manyRows = Array.from({ length: 60 }, (_, index) => ({
        id: index + 1,
        name: `Activity ${index + 1}`,
        description: '',
        estimatedCost: '1000',
        estimatedDuration: 60,
        latitude: null,
        longitude: null,
      }));
      const activityBuilder = chainableBuilder(manyRows);
      const categoryNamesBuilder = chainableBuilder([]);
      (
        dataSource as unknown as { createQueryBuilder: jest.Mock }
      ).createQueryBuilder = jest
        .fn()
        .mockReturnValueOnce(activityBuilder)
        .mockReturnValueOnce(categoryNamesBuilder);

      const result = await service.findCandidateActivities({
        id: 1,
        requestedAt: new Date(),
        idDepartment: 5,
        budget: null,
      } as PlanRequest);

      // Matches CANDIDATE_CAP in plan-generation.service.ts (not exported —
      // this asserts the observable capping behavior, not the constant).
      expect(result.length).toBe(24);
    });
  });

  describe('resolveIntent (CU17 checkpoint)', () => {
    it('skips interpretIntent entirely if intentResolvedAt is already set', async () => {
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        intentResolvedAt: new Date(),
        mode: PlanRequestMode.Automatic,
      } as PlanRequest;

      const result = await service.resolveIntent(planRequest);

      expect(result).toBe(planRequest);
      expect(gemini.interpretIntent).not.toHaveBeenCalled();
    });

    it('resolves surprise requests without calling Gemini', async () => {
      const categories = activeCategoryQuery([], 'getMany');
      const preferences = activeCategoryQuery([], 'getRawMany');
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Department) {
          return { find: jest.fn().mockResolvedValue([]) } as never;
        }
        if (entity === Category) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(categories),
          } as never;
        }
        if (entity === UserPreference) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(preferences),
          } as never;
        }
        return {} as never;
      });
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        intentResolvedAt: null,
        mode: PlanRequestMode.Surprise,
        idDepartment: 5,
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(gemini.interpretIntent).not.toHaveBeenCalled();
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ budget: null, idDepartment: 5 }),
      );
    });

    it('resolves surprise categories from the user preferences (CU19)', async () => {
      const categories = activeCategoryQuery([], 'getMany');
      const preferences = activeCategoryQuery(
        [{ idCategory: 10 }, { idCategory: 11 }],
        'getRawMany',
      );
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Department) {
          return { find: jest.fn().mockResolvedValue([]) } as never;
        }
        if (entity === Category) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(categories),
          } as never;
        }
        if (entity === UserPreference) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(preferences),
          } as never;
        }
        return {} as never;
      });
      const categoryRepository = {
        create: jest.fn((data: unknown) => data),
        save: jest.fn().mockResolvedValue(undefined),
      };
      transactionManager.getRepository.mockReturnValue(categoryRepository);
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        idUser: 7,
        intentResolvedAt: null,
        mode: PlanRequestMode.Surprise,
        idDepartment: 5,
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(categoryRepository.save).toHaveBeenCalledWith([
        { idPlanRequest: 1, idCategory: 10 },
        { idPlanRequest: 1, idCategory: 11 },
      ]);
    });

    it('calls interpretIntent for an automatic request and persists the resolved fields', async () => {
      dataSource.getRepository = jest.fn().mockImplementation((entity) => {
        if ((entity as { name: string }).name === 'Department') {
          return {
            find: jest.fn().mockResolvedValue([{ id: 1, name: 'Godoy Cruz' }]),
          } as never;
        }
        return {
          createQueryBuilder: jest
            .fn()
            .mockReturnValue(
              activeCategoryQuery([{ id: 10, name: 'Gastronomy' }], 'getMany'),
            ),
        } as never;
      });
      gemini.interpretIntent.mockResolvedValue({
        budget: 20000,
        departmentName: 'Godoy Cruz',
        categoryNames: ['Gastronomy'],
        partySize: 2,
        availableDuration: 180,
      });
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        intentResolvedAt: null,
        mode: PlanRequestMode.Automatic,
        // "distinto" is not understood locally, so the model resolves it.
        rawQuery: 'algo distinto',
        rawContext: null,
        idDepartment: null,
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(gemini.interpretIntent).toHaveBeenCalledTimes(1);
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({
          budget: 20000,
          idDepartment: 1,
          availableDuration: 180,
        }),
      );
    });
  });

  describe('resolveIntent fallback to preferences and defaults (CU17)', () => {
    function mockDepartmentsAndCategories(
      departments: { id: number; name: string }[] = [],
    ) {
      const categories = activeCategoryQuery([], 'getMany');
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Department) {
          return { find: jest.fn().mockResolvedValue(departments) } as never;
        }
        if (entity === Category) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(categories),
          } as never;
        }
        if (entity === UserPreference) {
          return {
            createQueryBuilder: jest
              .fn()
              .mockReturnValue(activeCategoryQuery([], 'getRawMany')),
          } as never;
        }
        return {} as never;
      });
    }

    it('fails rather than dropping ambiguous text restrictions when interpretation fails (CU17)', async () => {
      mockDepartmentsAndCategories([]);
      gemini.interpretIntent.mockRejectedValue(
        new RetryableJobError('Unavailable'),
      );
      await expect(
        service.resolveIntent({
          id: 1,
          idUser: 7,
          requestedAt: new Date(),
          intentResolvedAt: null,
          mode: PlanRequestMode.Automatic,
          rawQuery: 'Quiero cenar sin carne',
        } as PlanRequest),
      ).rejects.toThrow('GENERATION_PROVIDER_UNAVAILABLE');
      expect(transactionManager.update).not.toHaveBeenCalled();
      expect(
        geographicResolution.departmentWithMostActiveCandidates,
      ).not.toHaveBeenCalled();
    });

    it('never leaves budget/location missing: no explicit context, no Gemini match, no profile -> the busiest department and an unconstrained budget', async () => {
      mockDepartmentsAndCategories([]);
      gemini.interpretIntent.mockResolvedValue({
        budget: null,
        departmentName: null,
        categoryNames: [],
        partySize: null,
        availableDuration: null,
      });
      geographicResolution.departmentWithMostActiveCandidates.mockResolvedValue(
        7,
      );
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        intentResolvedAt: null,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo lindo para el finde',
        rawContext: null,
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ budget: null, idDepartment: 7 }),
      );
    });

    it('falls back to the stored preference profile when nothing explicit or inferred is available', async () => {
      mockDepartmentsAndCategories([]);
      gemini.interpretIntent.mockResolvedValue({
        budget: null,
        departmentName: null,
        categoryNames: [],
        partySize: null,
        availableDuration: null,
      });
      preferenceProfiles.findByUser.mockResolvedValue({
        usualBudget: 15000,
        usualPeopleCount: 4,
        preferredAreaLatitude: -32.89,
        preferredAreaLongitude: -68.84,
      } as UserPreferenceProfile);
      geographicResolution.nearestDepartment.mockResolvedValue(9);
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        intentResolvedAt: null,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo lindo',
        rawContext: null,
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(geographicResolution.nearestDepartment).toHaveBeenCalledWith(
        -32.89,
        -68.84,
      );
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({
          budget: 15000,
          idDepartment: 9,
          partySize: 4,
        }),
      );
    });

    it('lets an explicit or Gemini-inferred value outrank the stored profile', async () => {
      mockDepartmentsAndCategories([]);
      gemini.interpretIntent.mockResolvedValue({
        budget: 5000,
        departmentName: null,
        categoryNames: [],
        partySize: 8,
        availableDuration: null,
      });
      preferenceProfiles.findByUser.mockResolvedValue({
        usualBudget: 15000,
        usualPeopleCount: 2,
        preferredAreaLatitude: null,
        preferredAreaLongitude: null,
      } as UserPreferenceProfile);
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        intentResolvedAt: null,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'con 8 personas, presupuesto 5000',
        rawContext: null,
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ budget: 5000, partySize: 8 }),
      );
    });

    it('prefers device coordinates sent in the request context over the stored profile', async () => {
      mockDepartmentsAndCategories([]);
      gemini.interpretIntent.mockResolvedValue({
        budget: null,
        departmentName: null,
        categoryNames: [],
        partySize: null,
        availableDuration: null,
      });
      preferenceProfiles.findByUser.mockResolvedValue({
        usualBudget: null,
        usualPeopleCount: null,
        preferredAreaLatitude: -32.89,
        preferredAreaLongitude: -68.84,
      } as UserPreferenceProfile);
      geographicResolution.nearestDepartment.mockResolvedValue(3);
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        intentResolvedAt: null,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo cerca mio',
        rawContext: { latitude: -33.0, longitude: -68.9 },
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(geographicResolution.nearestDepartment).toHaveBeenCalledWith(
        -33.0,
        -68.9,
      );
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ idDepartment: 3 }),
      );
    });

    it('applies the same profile/default fallback to a surprise request with no resolvable location', async () => {
      const categories = activeCategoryQuery([], 'getMany');
      const preferences = activeCategoryQuery([], 'getRawMany');
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Department) {
          return { find: jest.fn().mockResolvedValue([]) } as never;
        }
        if (entity === Category) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(categories),
          } as never;
        }
        if (entity === UserPreference) {
          return {
            createQueryBuilder: jest.fn().mockReturnValue(preferences),
          } as never;
        }
        return {} as never;
      });
      preferenceProfiles.findByUser.mockResolvedValue({
        usualBudget: 8000,
        usualPeopleCount: 3,
      } as UserPreferenceProfile);
      geographicResolution.departmentWithMostActiveCandidates.mockResolvedValue(
        11,
      );
      const planRequest = {
        id: 1,
        requestedAt: new Date(),
        idUser: 7,
        intentResolvedAt: null,
        mode: PlanRequestMode.Surprise,
        idDepartment: null,
      } as PlanRequest;
      transactionManager.findOneOrFail.mockResolvedValue({
        ...planRequest,
        intentResolvedAt: new Date(),
      });

      await service.resolveIntent(planRequest);

      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({
          budget: 8000,
          partySize: 3,
          idDepartment: 11,
        }),
      );
    });
  });

  describe('optional routing budget (CU17/CU19)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it.each([28_000, 27_000, 5_000])(
      'persists valid plans within the deadline when composition takes %i ms and Maps hangs',
      async (compositionMs) => {
        const requestedAt = new Date();
        const row = {
          id: 1,
          idUser: 7,
          requestedAt,
          budget: null,
          availableDuration: null,
        } as PlanRequest;
        jest.spyOn(service, 'findCandidateActivities').mockResolvedValue(
          [1, 2].map((id) => ({
            id,
            name: 'Activity',
            description: null,
            estimatedCost: 10,
            price: fixedPrice(10),
            estimatedDuration: 10,
            categoryNames: [],
            latitude: -32.9,
            longitude: -68.8,
          })),
        );
        gemini.composePlans.mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(
                () =>
                  resolve([
                    {
                      title: 'Valid plan',
                      description: '',
                      activities: [
                        { activityId: 1, order: 1 },
                        { activityId: 2, order: 2 },
                      ],
                    },
                  ]),
                compositionMs,
              );
            }),
        );
        googleMaps.calculateRoute.mockReturnValue(new Promise(() => {}));
        transactionManager.save.mockResolvedValue({ id: 99 });
        const finalizedAt: number[] = [];
        transactionManager.update.mockImplementation(() => {
          finalizedAt.push(Date.now());
          return Promise.resolve(undefined);
        });
        const work = withinGenerationDeadline(row.requestedAt, () =>
          service.composeAndPersistPlans(row),
        );
        const completed = expect(work).resolves.toBeUndefined();
        await jest.advanceTimersByTimeAsync(compositionMs + 5_000);
        await completed;
        expect(transactionManager.save).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Valid plan',
            travelDistanceMeters: null,
            travelDurationSeconds: null,
          }),
        );
        expect(transactionManager.update).toHaveBeenCalledWith(
          PlanRequest,
          1,
          expect.objectContaining({ idRequestStatus: statusIdByKey.generated }),
        );
        expect(finalizedAt[0]).toBeLessThan(requestedAt.getTime() + 30_000);
        if (compositionMs === 28_000)
          expect(googleMaps.calculateRoute).not.toHaveBeenCalled();
        else {
          const signal = googleMaps.calculateRoute.mock.calls[0][1];
          expect(signal?.aborted).toBe(true);
        }
      },
    );

    it('retains fast routes and ignores a route that finishes after persistence', async () => {
      jest.spyOn(service, 'findCandidateActivities').mockResolvedValue(
        [1, 2, 3].map((id) => ({
          id,
          name: 'Activity',
          description: null,
          estimatedCost: 10,
          price: fixedPrice(10),
          estimatedDuration: 10,
          categoryNames: [],
          latitude: id === 3 ? -32.901 : -32.9,
          longitude: -68.8,
        })),
      );
      const plan = {
        title: 'Valid plan',
        description: '',
        activities: [
          { activityId: 1, order: 1 },
          { activityId: 2, order: 2 },
        ],
      };
      gemini.composePlans.mockResolvedValue([
        plan,
        {
          ...plan,
          title: 'Second plan',
          activities: [
            { activityId: 1, order: 1 },
            { activityId: 3, order: 2 },
          ],
        },
      ]);
      let resolveLate!: (route: {
        distanceMeters: number;
        durationSeconds: number;
      }) => void;
      googleMaps.calculateRoute.mockResolvedValueOnce({
        distanceMeters: 1000,
        durationSeconds: 120,
      });
      googleMaps.calculateRoute.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveLate = resolve;
        }),
      );
      transactionManager.save.mockResolvedValue({ id: 99 });
      const work = service.composeAndPersistPlans({
        id: 1,
        idUser: 7,
        requestedAt: new Date(),
        budget: null,
        availableDuration: null,
      } as PlanRequest);
      await jest.advanceTimersByTimeAsync(5_000);
      await work;
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Valid plan',
          travelDistanceMeters: 1000,
          travelDurationSeconds: 120,
        }),
      );
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Second plan',
          travelDistanceMeters: null,
          travelDurationSeconds: null,
        }),
      );
      const saves = transactionManager.save.mock.calls.length;
      resolveLate({ distanceMeters: 9000, durationSeconds: 900 });
      await jest.advanceTimersByTimeAsync(30_000);
      expect(transactionManager.save).toHaveBeenCalledTimes(saves);
    });
  });

  describe('composeAndPersistPlans (CU17 candidate/composition guard)', () => {
    const planRequest = {
      id: 1,
      idUser: 7,
      idDepartment: 3,
      rawQuery: 'algo tranquilo',
      requestedAt: new Date(),
      budget: 20000,
      availableDuration: 180,
      partySize: 4,
    } as PlanRequest;

    const recoveryCandidates: CandidateActivity[] = [1, 2].map((id) => ({
      id,
      name: `Activity ${id}`,
      description: '',
      estimatedCost: 100,
      price: fixedPrice(100),
      estimatedDuration: 30,
      categoryNames: [],
      latitude: null,
      longitude: null,
    }));
    const modelPlan = {
      title: 'A coherent outing',
      description: 'A model-selected combination',
      activities: [
        { activityId: 1, order: 1 },
        { activityId: 2, order: 2 },
      ],
    };

    it.each([
      { mode: PlanRequestMode.Automatic, intentSource: 'local' },
      { mode: PlanRequestMode.Surprise, intentSource: 'surprise' },
    ])(
      'uses model composition for $mode even when intent needs no model (CU17/CU19)',
      async ({ mode, intentSource }) => {
        jest
          .spyOn(service, 'findCandidateActivities')
          .mockResolvedValue(recoveryCandidates);
        gemini.composePlans.mockResolvedValue([modelPlan]);
        await service.composeAndPersistPlans({
          ...planRequest,
          requestedAt: new Date(),
          mode,
          resolvedOptions: { intentSource },
        } as PlanRequest);
        expect(gemini.composePlans).toHaveBeenCalledTimes(1);
        expect(transactionManager.save).toHaveBeenCalledWith(
          expect.objectContaining({ title: modelPlan.title }),
        );
      },
    );

    it.each(['transient failure', 'invalid result'])(
      'recovers a model plan after an early %s before using fallback (CU17)',
      async (failure) => {
        jest
          .spyOn(service, 'findCandidateActivities')
          .mockResolvedValue(recoveryCandidates);
        if (failure === 'transient failure')
          gemini.composePlans.mockRejectedValueOnce(
            new RetryableJobError('Network'),
          );
        else
          gemini.composePlans.mockResolvedValueOnce([
            {
              ...modelPlan,
              activities: [
                { activityId: 1, order: 1 },
                { activityId: 1, order: 2 },
              ],
            },
          ]);
        gemini.composePlans.mockResolvedValueOnce([modelPlan]);
        await service.composeAndPersistPlans({
          ...planRequest,
          requestedAt: new Date(),
        });
        expect(gemini.composePlans).toHaveBeenCalledTimes(2);
        expect(gemini.composePlans.mock.calls[1][0].retryInvalidResult).toBe(
          failure === 'invalid result',
        );
        expect(transactionManager.save).toHaveBeenCalledWith(
          expect.objectContaining({ title: modelPlan.title }),
        );
      },
    );

    it('uses only individual activities after both model attempts fail (CU17)', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue(recoveryCandidates);
      gemini.composePlans.mockRejectedValue(new RetryableJobError('Network'));
      await service.composeAndPersistPlans({
        ...planRequest,
        requestedAt: new Date(),
      });
      expect(gemini.composePlans).toHaveBeenCalledTimes(2);
      const detailBatches = transactionManager.save.mock.calls
        .map(([value]) => value as unknown)
        .filter(Array.isArray);
      expect(detailBatches).toHaveLength(2);
      expect(detailBatches.every((details) => details.length === 1)).toBe(true);
    });

    it('does not retry a permanent provider rejection before its last-resort fallback (CU17)', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue(recoveryCandidates);
      gemini.composePlans.mockRejectedValue(new PermanentJobError('Rejected'));
      await service.composeAndPersistPlans({
        ...planRequest,
        requestedAt: new Date(),
      });
      expect(gemini.composePlans).toHaveBeenCalledTimes(1);
      expect(transactionManager.save).toHaveBeenCalled();
    });

    it('keeps a successful model composition slower than five seconds (CU17)', async () => {
      jest.useFakeTimers();
      try {
        jest
          .spyOn(service, 'findCandidateActivities')
          .mockResolvedValue(recoveryCandidates);
        gemini.composePlans.mockImplementation(
          ({ timeoutMs }) =>
            new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new RetryableJobError('Timeout')),
                timeoutMs,
              );
              setTimeout(() => {
                clearTimeout(timeout);
                resolve([modelPlan]);
              }, 6_000);
            }),
        );
        const work = service.composeAndPersistPlans({
          ...planRequest,
          requestedAt: new Date(),
        });
        await jest.advanceTimersByTimeAsync(6_000);
        await work;
        expect(gemini.composePlans).toHaveBeenCalledTimes(1);
        expect(transactionManager.save).toHaveBeenCalledWith(
          expect.objectContaining({ title: modelPlan.title }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('shares one composition budget across recovery attempts and retains the persistence reserve (CU17)', async () => {
      jest.useFakeTimers();
      try {
        jest
          .spyOn(service, 'findCandidateActivities')
          .mockResolvedValue(recoveryCandidates);
        gemini.composePlans
          .mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 4_000));
            throw new RetryableJobError('Temporary failure');
          })
          .mockResolvedValueOnce([modelPlan]);
        const work = service.composeAndPersistPlans({
          ...planRequest,
          requestedAt: new Date(Date.now() - 20_000),
        });
        await jest.advanceTimersByTimeAsync(4_000);
        await work;
        expect(gemini.composePlans.mock.calls[0][0].timeoutMs).toBe(8_000);
        expect(gemini.composePlans.mock.calls[1][0].timeoutMs).toBe(4_000);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not retry when a model timeout consumes the shared composition budget (CU17)', async () => {
      jest.useFakeTimers();
      try {
        jest
          .spyOn(service, 'findCandidateActivities')
          .mockResolvedValue(recoveryCandidates);
        gemini.composePlans.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 12_000));
          throw new RetryableJobError('Timeout');
        });
        const work = service.composeAndPersistPlans({
          ...planRequest,
          requestedAt: new Date(),
        });
        await jest.advanceTimersByTimeAsync(12_000);
        await work;
        expect(gemini.composePlans).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('throws NO_VALID_COMBINATIONS without calling Gemini when there are no candidates', async () => {
      jest.spyOn(service, 'findCandidateActivities').mockResolvedValue([]);

      await expect(service.composeAndPersistPlans(planRequest)).rejects.toThrow(
        PermanentJobError,
      );
      expect(gemini.composePlans).not.toHaveBeenCalled();
    });

    it('generates and persists a plan with the only available activity (CU17)', async () => {
      jest.spyOn(service, 'findCandidateActivities').mockResolvedValue([
        {
          id: 1,
          requestedAt: new Date(),
          name: 'Wine tasting',
          description: 'desc',
          estimatedCost: 1000,

          price: fixedPrice(1000),
          estimatedDuration: 60,
          categoryNames: [],
          latitude: null,
          longitude: null,
        },
      ]);

      gemini.composePlans.mockResolvedValue([
        {
          title: 'Wine tasting',
          description: 'A single available activity',
          activities: [{ activityId: 1, order: 1 }],
        },
      ]);
      transactionManager.save = jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve({ id: 99 }))
        .mockImplementation(() => Promise.resolve(undefined));

      await service.composeAndPersistPlans(planRequest);

      expect(gemini.composePlans).not.toHaveBeenCalled();
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Wine tasting',
          estimatedTotalCost: 1000,
          estimatedTotalDuration: 60,
        }),
      );
      expect(transactionManager.save).toHaveBeenCalledWith([
        expect.objectContaining({ idPlan: 99, idActivity: 1, order: 1 }),
      ]);
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        planRequest.id,
        expect.objectContaining({ idRequestStatus: statusIdByKey.generated }),
      );
    });

    it('recovers valid catalog plans when Gemini returns no surviving plans', async () => {
      const candidates: CandidateActivity[] = [
        {
          id: 1,
          requestedAt: new Date(),
          name: 'Wine tasting',
          description: 'desc',
          estimatedCost: 1000,

          price: fixedPrice(1000),
          estimatedDuration: 60,
          categoryNames: [],
          latitude: null,
          longitude: null,
        },
      ];
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue([...candidates, { ...candidates[0], id: 2 }]);
      gemini.composePlans.mockResolvedValue([]);

      await expect(
        service.composeAndPersistPlans(planRequest),
      ).resolves.toBeUndefined();
      expect(gemini.composePlans).toHaveBeenCalledTimes(2);
      expect(transactionManager.save).toHaveBeenCalled();
    });

    it('persists a Plan and its PlanDetail rows, then marks the request generated', async () => {
      const candidates: CandidateActivity[] = [
        {
          id: 1,
          requestedAt: new Date(),
          name: 'Wine tasting',
          description: 'desc',
          estimatedCost: 15000,

          price: fixedPrice(15000),
          estimatedDuration: 90,
          categoryNames: [],
          latitude: null,
          longitude: null,
        },
        {
          id: 2,
          name: 'Coffee walk',
          description: 'desc',
          estimatedCost: 5000,

          price: fixedPrice(5000),
          estimatedDuration: 60,
          categoryNames: [],
          latitude: null,
          longitude: null,
        },
      ];
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue(candidates);
      gemini.composePlans.mockResolvedValue([
        {
          title: 'Tarde de vinos',
          description: 'desc',
          activities: [
            { activityId: 1, order: 1 },
            { activityId: 2, order: 2 },
          ],
        },
      ]);
      transactionManager.save = jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve({ id: 99 }))
        .mockImplementation(() => Promise.resolve(undefined));

      await service.composeAndPersistPlans(planRequest);

      expect(gemini.composePlans).toHaveBeenCalledWith(
        expect.objectContaining({ partySize: 4 }),
      );
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Tarde de vinos',
          idUser: 7,
          idPlanRequest: 1,
          idPlanStatus: planStatusIdByKey.generated,
          estimatedTotalCost: 20000,
          estimatedTotalDuration: 150,
        }),
      );
      expect(transactionManager.update).toHaveBeenCalledWith(
        PlanRequest,
        1,
        expect.objectContaining({ idRequestStatus: statusIdByKey.generated }),
      );
    });

    const overLimitCandidates: CandidateActivity[] = [
      {
        id: 1,
        requestedAt: new Date(),
        name: 'Wine tasting',
        description: 'desc',
        estimatedCost: 15000,

        price: fixedPrice(15000),
        estimatedDuration: 120,
        categoryNames: [],
        latitude: null,
        longitude: null,
      },
      {
        id: 2,
        name: 'Coffee walk',
        description: 'desc',
        estimatedCost: 15000,

        price: fixedPrice(15000),
        estimatedDuration: 120,
        categoryNames: [],
        latitude: null,
        longitude: null,
      },
    ];

    it('discards an alternative whose total cost exceeds the resolved budget', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue(overLimitCandidates);
      gemini.composePlans.mockResolvedValue([
        {
          title: 'Demasiado caro',
          description: 'desc',
          activities: [
            { activityId: 1, order: 1 },
            { activityId: 2, order: 2 },
          ],
        },
      ]);

      await expect(
        service.composeAndPersistPlans({
          ...planRequest,
          budget: 20000,
          availableDuration: null,
        } as PlanRequest),
      ).resolves.toBeUndefined();
      expect(transactionManager.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Demasiado caro' }),
      );
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ estimatedTotalCost: 15000 }),
      );
    });

    it('discards an alternative whose total duration exceeds the available time', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue(overLimitCandidates);
      gemini.composePlans.mockResolvedValue([
        {
          title: 'Demasiado largo',
          description: 'desc',
          activities: [
            { activityId: 1, order: 1 },
            { activityId: 2, order: 2 },
          ],
        },
      ]);

      await expect(
        service.composeAndPersistPlans({
          ...planRequest,
          budget: null,
          availableDuration: 180,
        } as PlanRequest),
      ).resolves.toBeUndefined();
      expect(transactionManager.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Demasiado largo' }),
      );
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ estimatedTotalDuration: 120 }),
      );
    });

    it('discards an alternative that repeats the same activity', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue(overLimitCandidates);
      gemini.composePlans.mockResolvedValue([
        {
          title: 'Repetida',
          description: 'desc',
          activities: [
            { activityId: 1, order: 1 },
            { activityId: 1, order: 2 },
          ],
        },
      ]);

      await expect(
        service.composeAndPersistPlans({
          ...planRequest,
          budget: null,
          availableDuration: null,
        } as PlanRequest),
      ).resolves.toBeUndefined();
      expect(transactionManager.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Repetida' }),
      );
    });

    it('keeps a valid alternative and drops an invalid one from the same batch', async () => {
      jest.spyOn(service, 'findCandidateActivities').mockResolvedValue([
        ...overLimitCandidates,
        {
          id: 3,
          name: 'Cheap walk',
          description: 'desc',
          estimatedCost: 1000,

          price: fixedPrice(1000),
          estimatedDuration: 30,
          categoryNames: [],
          latitude: null,
          longitude: null,
        },
      ]);
      gemini.composePlans.mockResolvedValue([
        {
          title: 'Cara',
          description: 'desc',
          activities: [
            { activityId: 1, order: 1 },
            { activityId: 2, order: 2 },
          ],
        },
        {
          title: 'Accesible',
          description: 'desc',
          activities: [{ activityId: 3, order: 1 }],
        },
      ]);
      transactionManager.save = jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve({ id: 42 }))
        .mockImplementation(() => Promise.resolve(undefined));

      await service.composeAndPersistPlans({
        ...planRequest,
        budget: 20000,
        availableDuration: null,
      } as PlanRequest);

      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Accesible' }),
      );
      expect(transactionManager.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cara' }),
      );
    });
  });
});
