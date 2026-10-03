import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Plan, PlanKind, PlanVisibility } from './entities/plan.entity';
import { PlansService } from './plans.service';
import { RatingModerationStatus } from '../ratings/entities/rating.entity';
import { MediaService } from '../media/media.service';

describe('PlansService', () => {
  let service: PlansService;
  let plans: jest.Mocked<Pick<Repository<Plan>, 'findOne' | 'find'>>;
  let managerFindOne: jest.Mock;

  function plan(overrides: Record<string, unknown> = {}): Plan {
    return {
      id: 5,
      title: 'Mendoza Highlights',
      description: null,
      idUser: 42,
      idPlanRequest: null,
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Public,
      estimatedTotalCost: 100,
      estimatedTotalDuration: 120,
      status: { key: 'confirmed', name: 'Confirmado' },
      details: [],
      ...overrides,
    } as unknown as Plan;
  }

  beforeEach(() => {
    plans = { findOne: jest.fn(), find: jest.fn() };
    managerFindOne = jest.fn().mockResolvedValue(null);
    service = new PlansService(
      {
        manager: { findOne: managerFindOne },
        query: jest.fn().mockResolvedValue([{ imageUrl: null }]),
      } as unknown as DataSource,
      plans as unknown as Repository<Plan>,
      { list: jest.fn().mockResolvedValue([]) } as unknown as MediaService,
    );
  });

  it('returns an ordered plan detail without exposing its owner (CU13)', async () => {
    plans.findOne.mockResolvedValue(plan());

    await expect(service.findOne(5, 99)).resolves.toEqual({
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
      images: [],
      status: { key: 'confirmed', name: 'Confirmado' },
      viewerPlanState: 'selectable',
      activeOutingId: null,
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Public,
      ownedByViewer: false,
      details: [],
    });
    expect(plans.find).not.toHaveBeenCalled();
  });

  it('lets the requester read and choose their own generated result (CU22)', async () => {
    plans.findOne.mockResolvedValue(
      plan({
        kind: PlanKind.Generated,
        visibility: PlanVisibility.Private,
        idPlanRequest: 3,
        status: { key: 'generated', name: 'Generado' },
      }),
    );

    await expect(service.findOne(5, 42)).resolves.toMatchObject({
      viewerPlanState: 'selectable',
      ownedByViewer: true,
    });
  });

  it("hides another person's private plan as if it did not exist (#98)", async () => {
    plans.findOne.mockResolvedValue(
      plan({ visibility: PlanVisibility.Private }),
    );

    await expect(service.findOne(5, 99)).rejects.toThrow(NotFoundException);
  });

  it("hides another person's generated result (#98)", async () => {
    plans.findOne.mockResolvedValue(
      plan({ kind: PlanKind.Generated, visibility: PlanVisibility.Private }),
    );

    await expect(service.findOne(5, 99)).rejects.toThrow(NotFoundException);
  });

  it('shows the owner their outing as view-only: it is not a source (#98)', async () => {
    plans.findOne.mockResolvedValue(
      plan({ kind: PlanKind.Outing, visibility: PlanVisibility.Private }),
    );

    await expect(service.findOne(5, 42)).resolves.toMatchObject({
      viewerPlanState: 'view-only',
      kind: PlanKind.Outing,
    });
  });

  it('includes only approved ratings in the shared plan detail (CU13)', async () => {
    plans.findOne.mockResolvedValue(
      plan({
        id: 11,
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
      }),
    );

    const result = await service.findOne(11, 99);

    expect(result.averageRating).toBe(5);
    expect(result.details[0].activity.averageRating).toBe(5);
    expect(result.details[0].activity.ratingCount).toBe(1);
  });

  it('reports "selected" with the outing id once the viewer chose the plan (CU22)', async () => {
    plans.findOne.mockResolvedValue(plan({ id: 9 }));
    managerFindOne.mockResolvedValue({ id: 77 });

    await expect(service.findOne(9, 99)).resolves.toMatchObject({
      viewerPlanState: 'selected',
      activeOutingId: 77,
    });
    expect(managerFindOne).toHaveBeenCalledWith(Plan, {
      select: { id: true },
      where: expect.objectContaining({
        kind: PlanKind.Outing,
        idSourcePlan: 9,
        idUser: 99,
      }) as unknown,
    });
  });

  it('does not expose cancelled plan details, not even to the owner (CU13)', async () => {
    plans.findOne.mockResolvedValue(
      plan({ status: { key: 'cancelled', name: 'Cancelado' } }),
    );

    await expect(service.findOne(5, 42)).rejects.toThrow(NotFoundException);
  });

  it('throws a controlled exception for a missing plan (CU13)', async () => {
    plans.findOne.mockResolvedValue(null);

    await expect(service.findOne(999, 99)).rejects.toThrow(NotFoundException);
  });

  describe('setVisibility (#98)', () => {
    function withLockedPlan(
      locked: Plan,
      activityCount: number,
    ): { save: jest.Mock; service: PlansService } {
      const save = jest.fn((entity: unknown) => entity);
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(locked),
        }),
        findOne: jest.fn((entity: { name: string }) =>
          entity.name === 'PlanStatus'
            ? { key: 'confirmed' }
            : { ...locked, details: [] },
        ),
        count: jest.fn().mockResolvedValue(activityCount),
        save,
        create: jest.fn((_entity: unknown, plain: unknown) => plain),
      };
      const dataSource = {
        manager,
        transaction: (work: (entityManager: typeof manager) => unknown) =>
          work(manager),
      } as unknown as DataSource;
      return {
        save,
        service: new PlansService(
          dataSource,
          plans as unknown as Repository<Plan>,
          { list: jest.fn().mockResolvedValue([]) } as unknown as MediaService,
        ),
      };
    }

    it('publishes a plan that has activities', async () => {
      const locked = plan({
        visibility: PlanVisibility.Private,
        peopleCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const { save, service: withLock } = withLockedPlan(locked, 2);

      await withLock.setVisibility(42, 5, PlanVisibility.Public);

      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: PlanVisibility.Public }),
      );
    });

    it('refuses to publish an empty plan', async () => {
      const locked = plan({ visibility: PlanVisibility.Private });
      const { service: withLock } = withLockedPlan(locked, 0);

      await expect(
        withLock.setVisibility(42, 5, PlanVisibility.Public),
      ).rejects.toThrow(ConflictException);
    });
  });
});
