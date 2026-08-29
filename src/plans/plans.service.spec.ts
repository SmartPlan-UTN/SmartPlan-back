import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlanIntention } from './entities/plan-intention.entity';
import { PlansService } from './plans.service';

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
});
