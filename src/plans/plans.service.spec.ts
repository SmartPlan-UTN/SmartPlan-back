import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;
  let plans: jest.Mocked<Pick<Repository<Plan>, 'findOne'>>;

  beforeEach(() => {
    plans = { findOne: jest.fn() };
    service = new PlansService(
      { manager: {} } as DataSource,
      plans as unknown as Repository<Plan>,
    );
  });

  it('returns an ordered plan detail without exposing its owner (CU13)', async () => {
    plans.findOne.mockResolvedValue({
      id: 5,
      title: 'Mendoza Highlights',
      description: null,
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
      status: { key: 'generated', name: 'Generado' },
      details: [],
    });
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
