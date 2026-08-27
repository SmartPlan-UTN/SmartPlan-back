import { DataSource, Repository } from 'typeorm';
import { Plan } from '../plans/entities/plan.entity';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { GoogleMapsClientService } from '../external-integration/google-maps/google-maps-client.service';
import { GeminiClientService } from './gemini/gemini-client.service';
import { PlanGenerationService } from './plan-generation.service';
import { PlanRequest, PlanRequestMode } from './entities/plan-request.entity';
import { CandidateActivity } from './dto/candidate-activity.dto';

describe('PlanGenerationService', () => {
  let service: PlanGenerationService;
  let planRequests: jest.Mocked<Pick<Repository<PlanRequest>, 'manager'>>;
  let plans: jest.Mocked<Pick<Repository<Plan>, 'count'>>;
  let dataSource: jest.Mocked<
    Pick<DataSource, 'transaction' | 'getRepository'>
  >;
  let gemini: jest.Mocked<
    Pick<GeminiClientService, 'interpretIntent' | 'composePlans'>
  >;
  let googleMaps: jest.Mocked<Pick<GoogleMapsClientService, 'calculateRoute'>>;

  let transactionManager: {
    createQueryBuilder: jest.Mock;
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
      getOne: jest.fn(),
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
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity: unknown, data: unknown) => data),
    };

    planRequests = {
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

    service = new PlanGenerationService(
      planRequests as unknown as Repository<PlanRequest>,
      plans as unknown as Repository<Plan>,
      dataSource as unknown as DataSource,
      gemini as unknown as GeminiClientService,
      googleMaps as unknown as GoogleMapsClientService,
    );
  });

  describe('claim', () => {
    it('claims a pending request and marks it processing', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
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
        status: { key: 'generated' },
      });

      await expect(service.claim(1)).resolves.toBe('terminal');
      expect(transactionManager.update).not.toHaveBeenCalled();
    });

    it('treats failed as terminal (no-op)', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        status: { key: 'failed' },
      });

      await expect(service.claim(1)).resolves.toBe('terminal');
    });

    it('finalizes a stuck request to generated when Plans already exist but its status is still pending', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
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
        status: { key: 'generated' },
      });
      transactionManager.count.mockResolvedValue(2);

      await expect(service.claim(1)).resolves.toBe('terminal');
      expect(transactionManager.update).not.toHaveBeenCalled();
    });

    it('skips (no-op) a request that another attempt is actively processing', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        status: { key: 'processing' },
        processingStartedAt: new Date(),
      });

      await expect(service.claim(1)).resolves.toBe('skip');
      expect(transactionManager.update).not.toHaveBeenCalled();
    });

    it('re-claims a stale processing request so the recovery redelivery can regenerate', async () => {
      requestQueryBuilder.getOne.mockResolvedValue({
        id: 1,
        status: { key: 'processing' },
        processingStartedAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      await expect(service.claim(1)).resolves.toBe('claimed');
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
      expect(update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ idRequestStatus: statusIdByKey.generated }),
      );
    });
  });

  describe('resolveIntent (CU17 checkpoint)', () => {
    it('skips interpretIntent entirely if intentResolvedAt is already set', async () => {
      const planRequest = {
        id: 1,
        intentResolvedAt: new Date(),
        mode: PlanRequestMode.Automatic,
      } as PlanRequest;

      const result = await service.resolveIntent(planRequest);

      expect(result).toBe(planRequest);
      expect(gemini.interpretIntent).not.toHaveBeenCalled();
    });

    it('resolves surprise requests without calling Gemini', async () => {
      const planRequest = {
        id: 1,
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
      dataSource.getRepository = jest.fn().mockReturnValue({
        find: jest
          .fn()
          .mockResolvedValue([{ idCategory: 10 }, { idCategory: 11 }]),
      });
      const categoryRepository = {
        create: jest.fn((data: unknown) => data),
        save: jest.fn().mockResolvedValue(undefined),
      };
      transactionManager.getRepository.mockReturnValue(categoryRepository);
      const planRequest = {
        id: 1,
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
          };
        }
        return {
          find: jest.fn().mockResolvedValue([{ id: 10, name: 'Gastronomy' }]),
        };
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
        intentResolvedAt: null,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo tranquilo',
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

  describe('assertRequiredContext (CU17/CU19)', () => {
    it('passes for an automatic request with budget and department resolved', () => {
      expect(() =>
        service.assertRequiredContext({
          mode: PlanRequestMode.Automatic,
          budget: 1000,
          idDepartment: 1,
        } as PlanRequest),
      ).not.toThrow();
    });

    it('throws a permanent error listing missing fields for an automatic request', () => {
      expect(() =>
        service.assertRequiredContext({
          mode: PlanRequestMode.Automatic,
          budget: null,
          idDepartment: null,
        } as PlanRequest),
      ).toThrow(PermanentJobError);
    });

    it('passes for a surprise request with a resolved department', () => {
      expect(() =>
        service.assertRequiredContext({
          mode: PlanRequestMode.Surprise,
          idDepartment: 1,
        } as PlanRequest),
      ).not.toThrow();
    });

    it('throws a permanent error for a surprise request without a location', () => {
      expect(() =>
        service.assertRequiredContext({
          mode: PlanRequestMode.Surprise,
          idDepartment: null,
        } as PlanRequest),
      ).toThrow(PermanentJobError);
    });
  });

  describe('composeAndPersistPlans (CU17 candidate/composition guard)', () => {
    const planRequest = {
      id: 1,
      idUser: 7,
      idDepartment: 3,
      rawQuery: 'algo tranquilo',
      budget: 20000,
      availableDuration: 180,
    } as PlanRequest;

    it('throws NO_VALID_COMBINATIONS without calling Gemini when there are no candidates', async () => {
      jest.spyOn(service, 'findCandidateActivities').mockResolvedValue([]);

      await expect(service.composeAndPersistPlans(planRequest)).rejects.toThrow(
        PermanentJobError,
      );
      expect(gemini.composePlans).not.toHaveBeenCalled();
    });

    it('throws NO_VALID_COMBINATIONS when Gemini returns no surviving plans', async () => {
      const candidates: CandidateActivity[] = [
        {
          id: 1,
          name: 'Wine tasting',
          description: 'desc',
          estimatedCost: 1000,
          estimatedDuration: 60,
          categoryNames: [],
          latitude: null,
          longitude: null,
        },
      ];
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue(candidates);
      gemini.composePlans.mockResolvedValue([]);

      await expect(service.composeAndPersistPlans(planRequest)).rejects.toThrow(
        PermanentJobError,
      );
    });

    it('persists a Plan and its PlanDetail rows, then marks the request generated', async () => {
      const candidates: CandidateActivity[] = [
        {
          id: 1,
          name: 'Wine tasting',
          description: 'desc',
          estimatedCost: 15000,
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
      const savedPlan = { id: 99 };
      transactionManager.save = jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve(savedPlan))
        .mockImplementation(() => Promise.resolve(undefined));

      await service.composeAndPersistPlans(planRequest);

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
        name: 'Wine tasting',
        description: 'desc',
        estimatedCost: 15000,
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
      ).rejects.toThrow(PermanentJobError);
      expect(transactionManager.save).not.toHaveBeenCalled();
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
      ).rejects.toThrow(PermanentJobError);
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
      ).rejects.toThrow(PermanentJobError);
    });

    it('keeps a valid alternative and drops an invalid one from the same batch', async () => {
      jest.spyOn(service, 'findCandidateActivities').mockResolvedValue([
        ...overLimitCandidates,
        {
          id: 3,
          name: 'Cheap walk',
          description: 'desc',
          estimatedCost: 1000,
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

  describe('composeAndPersistPlans (CU19 surprise rules)', () => {
    const planFrom = (mode: PlanRequestMode) =>
      ({
        id: 1,
        idUser: 7,
        idDepartment: 3,
        mode,
        rawQuery: null,
        budget: null,
        availableDuration: null,
      }) as PlanRequest;

    const candidate = (id: number): CandidateActivity => ({
      id,
      name: `Activity ${id}`,
      description: 'desc',
      estimatedCost: 1000,
      estimatedDuration: 30,
      categoryNames: [],
      latitude: null,
      longitude: null,
    });

    const persistPlan = (title: string, activityIds: number[]) => ({
      title,
      description: 'desc',
      activities: activityIds.map((activityId, index) => ({
        activityId,
        order: index + 1,
      })),
    });

    beforeEach(() => {
      transactionManager.save = jest.fn((arg: unknown) =>
        Promise.resolve(
          arg && typeof arg === 'object' && 'title' in arg
            ? { id: 99 }
            : undefined,
        ),
      );
    });

    it('fails a surprise request with fewer than two nearby activities', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue([candidate(1)]);

      await expect(
        service.composeAndPersistPlans(planFrom(PlanRequestMode.Surprise)),
      ).rejects.toThrow(PermanentJobError);
      expect(gemini.composePlans).not.toHaveBeenCalled();
    });

    it('still generates an automatic request with a single nearby activity (CU17 unchanged)', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue([candidate(1)]);
      gemini.composePlans.mockResolvedValue([persistPlan('Solo', [1])]);

      await expect(
        service.composeAndPersistPlans(planFrom(PlanRequestMode.Automatic)),
      ).resolves.toBeUndefined();
      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Solo' }),
      );
    });

    it('drops a single-activity alternative from a surprise batch', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue([candidate(1), candidate(2), candidate(3)]);
      gemini.composePlans.mockResolvedValue([
        persistPlan('Real outing', [1, 2]),
        persistPlan('Just one stop', [3]),
      ]);

      await service.composeAndPersistPlans(planFrom(PlanRequestMode.Surprise));

      expect(transactionManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Real outing' }),
      );
      expect(transactionManager.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Just one stop' }),
      );
    });

    it('fails a surprise request when no alternative has two activities', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue([candidate(1), candidate(2)]);
      gemini.composePlans.mockResolvedValue([
        persistPlan('One', [1]),
        persistPlan('Also one', [2]),
      ]);

      await expect(
        service.composeAndPersistPlans(planFrom(PlanRequestMode.Surprise)),
      ).rejects.toThrow(PermanentJobError);
    });

    it('persists at most three alternatives', async () => {
      jest
        .spyOn(service, 'findCandidateActivities')
        .mockResolvedValue([candidate(1), candidate(2)]);
      gemini.composePlans.mockResolvedValue([
        persistPlan('P1', [1, 2]),
        persistPlan('P2', [1, 2]),
        persistPlan('P3', [1, 2]),
        persistPlan('P4', [1, 2]),
        persistPlan('P5', [1, 2]),
      ]);

      await service.composeAndPersistPlans(planFrom(PlanRequestMode.Surprise));

      const persistedTitles = transactionManager.save.mock.calls
        .map(([arg]) =>
          arg && typeof arg === 'object' && 'title' in (arg as object)
            ? (arg as { title: string }).title
            : null,
        )
        .filter((title): title is string => title !== null);
      expect(persistedTitles).toEqual(['P1', 'P2', 'P3']);
    });
  });
});
