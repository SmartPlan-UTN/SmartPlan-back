import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlanIntention } from './entities/plan-intention.entity';
import { PlansService } from './plans.service';
import { RatingModerationStatus } from '../ratings/entities/rating.entity';

describe('PlansService', () => {
  let service: PlansService;
  let plans: jest.Mocked<Pick<Repository<Plan>, 'findOne' | 'find'>>;
  let intentions: jest.Mocked<Pick<Repository<PlanIntention>, 'findOne'>>;

  beforeEach(() => {
    plans = { findOne: jest.fn(), find: jest.fn() };
    intentions = { findOne: jest.fn().mockResolvedValue(null) };
    service = new PlansService(
      {
        manager: {},
        getRepository: jest.fn().mockReturnValue(intentions),
      } as unknown as DataSource,
      plans as unknown as Repository<Plan>,
    );
  });

  it('returns an ordered plan detail without exposing its owner (CU13)', async () => {
    plans.findOne.mockResolvedValue({
      id: 5,
      title: 'Mendoza Highlights',
      description: null,
      idUser: 42,
      idPlanRequest: null,
      estimatedTotalCost: 100,
      estimatedTotalDuration: 120,
      status: { key: 'generated', name: 'Generado' },
      request: null,
      details: [],
    } as unknown as Plan);

    await expect(service.findOne(5)).resolves.toEqual({
      id: 5,
      title: 'Mendoza Highlights',
      description: null,
      estimatedTotalCost: 100,
      estimatedTotalDuration: 120,
      activityCount: 0,
      averageRating: 0,
      distanceKm: null,
      categories: [],
      activityNames: [],
      imageUrl: null,
      status: { key: 'generated', name: 'Generado' },
      viewerPlanState: 'view-only',
      details: [],
    });
    expect(plans.find).not.toHaveBeenCalled();
  });

  it('reports viewerPlanState "selectable" to the owner of a generated plan (CU22)', async () => {
    plans.findOne.mockResolvedValue({
      id: 7,
      title: 'Weekend',
      description: null,
      idUser: 42,
      idPlanRequest: 3,
      estimatedTotalCost: 0,
      estimatedTotalDuration: 0,
      status: { key: 'generated', name: 'Generado' },
      request: null,
      details: [],
    } as unknown as Plan);
    await expect(service.findOne(7, 42)).resolves.toMatchObject({
      viewerPlanState: 'selectable',
    });
  });

  it('includes only approved ratings in the public plan detail (CU13)', async () => {
    plans.findOne.mockResolvedValue({
      id: 11,
      title: 'Weekend',
      description: null,
      idUser: 42,
      idPlanRequest: 3,
      estimatedTotalCost: 100,
      estimatedTotalDuration: 120,
      status: { key: 'generated', name: 'Generado' },
      details: [
        {
          id: 12,
          order: 1,
          estimatedCost: 100,
          estimatedDuration: 120,
          activity: {
            id: 13,
            name: 'Activity',
            description: null,
            estimatedCost: 100,
            estimatedDuration: 120,
            type: null,
            categories: [],
            places: [],
            ratings: [
              { score: 5, moderationStatus: RatingModerationStatus.Approved },
              { score: 1, moderationStatus: RatingModerationStatus.Rejected },
            ],
          },
        },
      ],
    } as unknown as Plan);

    const result = await service.findOne(11);

    expect(result.averageRating).toBe(5);
    expect(result.details[0].activity.averageRating).toBe(5);
    expect(result.details[0].activity.ratingCount).toBe(1);
  });

  it('reports viewerPlanState "selectable" to a non-owner of another user\'s plan (CU22)', async () => {
    plans.findOne.mockResolvedValue({
      id: 8,
      title: 'Weekend',
      description: null,
      idUser: 42,
      idPlanRequest: 3,
      estimatedTotalCost: 0,
      estimatedTotalDuration: 0,
      status: { key: 'generated', name: 'Generado' },
      request: null,
      details: [],
    } as unknown as Plan);

    await expect(service.findOne(8, 99)).resolves.toMatchObject({
      viewerPlanState: 'selectable',
    });
    expect(intentions.findOne).toHaveBeenCalledWith({
      where: { idPlan: 8, idUser: 99 },
    });
  });

  it('reports viewerPlanState "selected" once the viewer holds an intention (CU22)', async () => {
    plans.findOne.mockResolvedValue({
      id: 9,
      title: 'Weekend',
      description: null,
      idUser: 42,
      idPlanRequest: 3,
      estimatedTotalCost: 0,
      estimatedTotalDuration: 0,
      status: { key: 'generated', name: 'Generado' },
      request: null,
      details: [],
    } as unknown as Plan);
    intentions.findOne.mockResolvedValue({ id: 1 } as unknown as PlanIntention);

    await expect(service.findOne(9, 99)).resolves.toMatchObject({
      viewerPlanState: 'selected',
    });
  });

  it('keeps a cancelled plan out of reach even for an authenticated viewer (CU22)', async () => {
    plans.findOne.mockResolvedValue({
      id: 10,
      status: { key: 'cancelled', name: 'Cancelado' },
    } as Plan);

    await expect(service.findOne(10, 99)).rejects.toThrow(NotFoundException);
  });

  it('does not expose cancelled plans through public exploration (CU13)', async () => {
    plans.findOne.mockResolvedValue({
      id: 6,
      status: { key: 'cancelled', name: 'Cancelado' },
    } as Plan);

    await expect(service.findOne(6)).rejects.toThrow(NotFoundException);
  });

  it('throws a controlled exception for a missing plan (CU13)', async () => {
    plans.findOne.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  describe('feedback lifecycle in the owner plan detail (CU23)', () => {
    const managerFindOne = jest.fn();

    function buildService(): PlansService {
      return new PlansService(
        { manager: { findOne: managerFindOne } } as unknown as DataSource,
        plans as unknown as Repository<Plan>,
      );
    }

    function ownPlan(overrides: Partial<Plan>): Plan {
      return {
        id: 10,
        title: 'Tarde de vinos',
        description: null,
        estimatedTotalCost: 25000,
        estimatedTotalDuration: 180,
        peopleCount: 2,
        status: { key: 'completed', name: 'Realizado' },
        completedAt: null,
        feedbackRequestedAt: null,
        feedback: null,
        details: [],
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
        updatedAt: new Date('2026-08-12T00:00:00.000Z'),
        ...overrides,
      } as unknown as Plan;
    }

    beforeEach(() => managerFindOne.mockReset());

    it('is not_available while the plan is not completed', async () => {
      managerFindOne.mockResolvedValue(
        ownPlan({ status: { key: 'confirmed', name: 'Confirmado' } as never }),
      );

      const detail = await buildService().findOwnOne(7, 10);

      expect(detail.feedbackState).toBe('not_available');
      expect(detail.feedback).toBeNull();
    });

    it('is not_available for a plan completed less than 24h ago with no reminder', async () => {
      managerFindOne.mockResolvedValue(
        ownPlan({ completedAt: new Date(Date.now() - 60 * 60 * 1000) }),
      );

      const detail = await buildService().findOwnOne(7, 10);

      expect(detail.feedbackState).toBe('not_available');
    });

    it('is available once the reminder was sent', async () => {
      managerFindOne.mockResolvedValue(
        ownPlan({
          completedAt: new Date(Date.now() - 60 * 60 * 1000),
          feedbackRequestedAt: new Date(Date.now() - 30 * 60 * 1000),
        }),
      );

      expect((await buildService().findOwnOne(7, 10)).feedbackState).toBe(
        'available',
      );
    });

    it('is available 24h after completion even without a reminder row', async () => {
      managerFindOne.mockResolvedValue(
        ownPlan({ completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }),
      );

      expect((await buildService().findOwnOne(7, 10)).feedbackState).toBe(
        'available',
      );
    });

    it('is submitted and returns the sanitised feedback once recorded', async () => {
      const createdAt = new Date('2026-08-14T10:00:00.000Z');
      managerFindOne.mockResolvedValue(
        ownPlan({
          completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          feedbackRequestedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          feedback: {
            id: 1,
            rating: 4,
            tags: ['would_recommend'],
            comment: 'Muy lindo plan',
            actualCost: 28400,
            actualDuration: 200,
            createdAt,
            deletedAt: null,
            idFeedbackStatus: 1,
          } as never,
        }),
      );

      const detail = await buildService().findOwnOne(7, 10);

      expect(detail.feedbackState).toBe('submitted');
      expect(detail.feedback).toEqual({
        rating: 4,
        tags: ['would_recommend'],
        comment: 'Muy lindo plan',
        actualCost: 28400,
        actualDuration: 200,
        createdAt,
      });
    });
  });
});
