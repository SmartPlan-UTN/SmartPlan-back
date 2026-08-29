import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EnvironmentVariables } from '../config/environment-variables';
import { MessagingService } from '../messaging/messaging.service';
import { JobType } from '../messaging/types/job-type';
import { PlansService } from '../plans/plans.service';
import { PlanRequest, PlanRequestMode } from './entities/plan-request.entity';
import { GeographicResolutionService } from './geographic-resolution.service';
import { PlanRequestsService } from './plan-requests.service';

describe('PlanRequestsService', () => {
  let service: PlanRequestsService;
  let planRequests: jest.Mocked<
    Pick<
      Repository<PlanRequest>,
      | 'create'
      | 'save'
      | 'update'
      | 'findOne'
      | 'createQueryBuilder'
      | 'manager'
    >
  >;
  let messaging: jest.Mocked<Pick<MessagingService, 'publish'>>;
  let configuration: jest.Mocked<
    Pick<ConfigService<EnvironmentVariables, true>, 'get'>
  >;
  let geographicResolution: jest.Mocked<
    Pick<GeographicResolutionService, 'nearestDepartment'>
  >;
  let plansService: jest.Mocked<Pick<PlansService, 'findOne'>>;
  let getCount: jest.Mock;
  let getRawOne: jest.Mock;
  let planFind: jest.Mock;

  beforeEach(() => {
    getCount = jest.fn().mockResolvedValue(0);
    getRawOne = jest.fn().mockResolvedValue({ id: 1 });

    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount,
    };

    const managerQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne,
    };

    planFind = jest.fn().mockResolvedValue([]);

    planRequests = {
      create: jest.fn((entity) => entity as PlanRequest),
      save: jest.fn((entity) =>
        Promise.resolve({ id: 42, ...entity } as PlanRequest),
      ),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(managerQueryBuilder),
        getRepository: jest.fn().mockReturnValue({ find: planFind }),
      } as unknown as Repository<PlanRequest>['manager'],
    };

    messaging = { publish: jest.fn().mockResolvedValue('job-id') };
    configuration = { get: jest.fn().mockReturnValue(3) };
    geographicResolution = {
      nearestDepartment: jest.fn().mockResolvedValue(1),
    };
    plansService = { findOne: jest.fn() };

    service = new PlanRequestsService(
      planRequests as unknown as Repository<PlanRequest>,
      messaging as unknown as MessagingService,
      configuration as unknown as ConfigService<EnvironmentVariables, true>,
      geographicResolution as unknown as GeographicResolutionService,
      plansService as unknown as PlansService,
    );
  });

  describe('createAutomatic (CU17)', () => {
    it('persists the request as pending and publishes the generation job', async () => {
      const result = await service.createAutomatic(7, {
        query: 'quiero cenar algo tranquilo',
      });

      expect(planRequests.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idUser: 7,
          mode: PlanRequestMode.Automatic,
          rawQuery: 'quiero cenar algo tranquilo',
          rawContext: null,
        }),
      );
      expect(messaging.publish).toHaveBeenCalledWith(
        JobType.GeneratePlanRequest,
        { planRequestId: 42 },
      );
      expect(result).toEqual({
        id: 42,
        statusKey: 'pending',
        mode: PlanRequestMode.Automatic,
        requestedAt: expect.any(Date) as Date,
      });
    });

    it('persists context chips verbatim as rawContext', async () => {
      await service.createAutomatic(7, {
        query: 'algo romántico',
        context: { budget: 20000, partySize: 2 },
      });

      expect(planRequests.save).toHaveBeenCalledWith(
        expect.objectContaining({
          rawContext: { budget: 20000, partySize: 2 },
        }),
      );
    });

    it('rejects with 429 when the user already has too many active requests (CU17)', async () => {
      getCount.mockResolvedValue(3);

      await expect(
        service.createAutomatic(7, { query: 'algo' }),
      ).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      expect(planRequests.save).not.toHaveBeenCalled();
    });

    it('marks the request as failed and returns 503 when publish fails', async () => {
      messaging.publish.mockRejectedValue(new Error('broker unavailable'));

      await expect(
        service.createAutomatic(7, { query: 'algo' }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(planRequests.update).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ failureCode: 'GENERATION_UNAVAILABLE' }),
      );
    });
  });

  describe('createSurprise (CU19)', () => {
    it('resolves the nearest department from GPS and persists it with coordinates as context', async () => {
      geographicResolution.nearestDepartment.mockResolvedValue(5);

      const result = await service.createSurprise(7, {
        latitude: -32.89,
        longitude: -68.84,
      });

      expect(geographicResolution.nearestDepartment).toHaveBeenCalledWith(
        -32.89,
        -68.84,
      );
      const [savedEntity] = planRequests.save.mock.calls[0];
      expect(savedEntity).toMatchObject({
        mode: PlanRequestMode.Surprise,
        idDepartment: 5,
        rawContext: { latitude: -32.89, longitude: -68.84 },
      });
      expect(savedEntity).not.toHaveProperty('rawQuery');
      expect(result.mode).toBe(PlanRequestMode.Surprise);
    });

    it('rejects with 409 when no coordinates are provided', async () => {
      await expect(service.createSurprise(7, {})).rejects.toThrow(
        ConflictException,
      );
      expect(planRequests.save).not.toHaveBeenCalled();
    });

    it('rejects with 409 when no department can be resolved from the coordinates', async () => {
      geographicResolution.nearestDepartment.mockResolvedValue(null);

      await expect(
        service.createSurprise(7, { latitude: -32.89, longitude: -68.84 }),
      ).rejects.toThrow(ConflictException);
      expect(planRequests.save).not.toHaveBeenCalled();
    });
  });

  describe('findStatus', () => {
    it('returns the status for the owner', async () => {
      planRequests.findOne.mockResolvedValue({
        id: 42,
        idUser: 7,
        status: { key: 'pending' },
        mode: PlanRequestMode.Automatic,
        requestedAt: new Date('2026-01-01'),
        failedAt: null,
        failureCode: null,
        failureDetail: null,
      } as unknown as PlanRequest);

      const result = await service.findStatus(42, 7);

      expect(result).toEqual({
        id: 42,
        statusKey: 'pending',
        mode: PlanRequestMode.Automatic,
        requestedAt: new Date('2026-01-01'),
        plans: undefined,
        failedAt: null,
        failureCode: null,
        failureDetail: null,
      });
    });

    it('includes the generated plans when the request is generated', async () => {
      planRequests.findOne.mockResolvedValue({
        id: 42,
        idUser: 7,
        status: { key: 'generated' },
        mode: PlanRequestMode.Automatic,
        requestedAt: new Date('2026-01-01'),
        failedAt: null,
        failureCode: null,
        failureDetail: null,
      } as unknown as PlanRequest);
      planFind.mockResolvedValue([{ id: 5 }, { id: 6 }]);
      plansService.findOne
        .mockResolvedValueOnce({ id: 5 } as never)
        .mockResolvedValueOnce({ id: 6 } as never);

      const result = await service.findStatus(42, 7);

      expect(planFind).toHaveBeenCalledWith(
        expect.objectContaining({ where: { idPlanRequest: 42 } }),
      );
      expect(plansService.findOne).toHaveBeenCalledWith(5, 7);
      expect(plansService.findOne).toHaveBeenCalledWith(6, 7);
      expect(result.plans).toEqual([{ id: 5 }, { id: 6 }]);
    });

    it('rejects access to a plan request owned by another user (ownership)', async () => {
      planRequests.findOne.mockResolvedValue({
        id: 42,
        idUser: 999,
        status: { key: 'pending' },
      } as unknown as PlanRequest);

      await expect(service.findStatus(42, 7)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws not found for a missing plan request', async () => {
      planRequests.findOne.mockResolvedValue(null);

      await expect(service.findStatus(999, 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
