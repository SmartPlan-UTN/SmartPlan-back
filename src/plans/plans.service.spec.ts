import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;
  let plans: jest.Mocked<Pick<Repository<Plan>, 'findOne'>>;

  beforeEach(() => {
    plans = { findOne: jest.fn() };
    service = new PlansService(plans as unknown as Repository<Plan>);
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
});
