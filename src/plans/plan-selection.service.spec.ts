import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlanIntention } from './entities/plan-intention.entity';
import { PlanVisibility } from './entities/plan.entity';
import { PlanSelectionService } from './plan-selection.service';

describe('PlanSelectionService (CU22)', () => {
  const plan = {
    id: 4,
    idUser: 1,
    idPlanRequest: 8,
    visibility: PlanVisibility.Private,
    status: { key: 'generated', name: 'Generado' },
  };
  const intention = { id: 10, idUser: 2, idPlan: 4 };
  let manager: {
    findOne: jest.Mock;
    query: jest.Mock;
    softRemove: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: PlanSelectionService;

  beforeEach(() => {
    manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce(undefined),
      query: jest.fn().mockResolvedValue([]),
      softRemove: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    service = new PlanSelectionService(dataSource as unknown as DataSource);
  });

  it('creates an intention for a non-owner on a private plan without changing plan status', async () => {
    const result = await service.select(plan.id, 2);

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "plan_intention"'),
      [2, plan.id],
    );
    expect(result).toMatchObject({
      id: plan.id,
      status: plan.status,
      viewerPlanState: 'selectable',
    });
  });

  it('withdraws only the caller intention and never updates the plan', async () => {
    manager.findOne = jest
      .fn()
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(intention)
      .mockResolvedValueOnce(undefined);

    await service.deselect(plan.id, 2);

    expect(manager.softRemove).toHaveBeenCalledWith(PlanIntention, intention);
  });

  it('allows two users to target the same plan', async () => {
    await service.select(plan.id, 2);
    manager.findOne = jest
      .fn()
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(undefined);
    await service.select(plan.id, 3);

    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('rejects an intention on a cancelled plan', async () => {
    manager.findOne = jest.fn().mockResolvedValueOnce({
      ...plan,
      status: { key: 'cancelled', name: 'Cancelado' },
    });

    await expect(service.select(plan.id, 2)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.query).not.toHaveBeenCalled();
  });
});
