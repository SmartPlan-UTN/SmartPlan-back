import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlanSelectionService } from './plan-selection.service';

describe('PlanSelectionService (CU22)', () => {
  let service: PlanSelectionService;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
  let manager: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  let planQueryBuilder: {
    innerJoinAndSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let lockQueryBuilder: {
    setLock: jest.Mock;
    where: jest.Mock;
    getMany: jest.Mock;
  };
  let statusQueryBuilder: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };

  const statusIdByKey: Record<string, number> = {
    generated: 1,
    selected: 2,
  };

  beforeEach(() => {
    planQueryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    lockQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    statusQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
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
        const id = statusIdByKey[key];
        return Promise.resolve(id ? { id } : undefined);
      }),
    };

    manager = {
      createQueryBuilder: jest.fn((entity?: unknown, alias?: string) => {
        if (entity === undefined) return statusQueryBuilder;
        if (alias === 'lock') return lockQueryBuilder;
        return planQueryBuilder;
      }),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      findOneOrFail: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(
        (runInTransaction: (manager: typeof manager) => unknown) =>
          Promise.resolve(runInTransaction(manager)),
      ),
    };

    service = new PlanSelectionService(dataSource as unknown as DataSource);
  });

  it('throws not found for a missing plan', async () => {
    planQueryBuilder.getOne.mockResolvedValue(null);

    await expect(service.select(1, 7)).rejects.toThrow(NotFoundException);
  });

  it('rejects selecting a plan owned by another user', async () => {
    planQueryBuilder.getOne.mockResolvedValue({
      id: 1,
      idUser: 999,
      idPlanRequest: 10,
      status: { key: 'generated' },
    });

    await expect(service.select(1, 7)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a plan that is not part of a plan request', async () => {
    planQueryBuilder.getOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      idPlanRequest: null,
      status: { key: 'generated' },
    });

    await expect(service.select(1, 7)).rejects.toThrow(ConflictException);
  });

  it('rejects when a sibling plan already advanced past selection', async () => {
    planQueryBuilder.getOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      idPlanRequest: 10,
      status: { key: 'generated' },
    });
    manager.find.mockResolvedValue([
      { id: 1, status: { key: 'generated' } },
      { id: 2, status: { key: 'confirmed' } },
    ]);

    await expect(service.select(1, 7)).rejects.toThrow(ConflictException);
  });

  it('selects the plan and demotes a previously selected sibling to generated', async () => {
    planQueryBuilder.getOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      idPlanRequest: 10,
      status: { key: 'generated' },
    });
    manager.find.mockResolvedValue([
      { id: 1, status: { key: 'generated' } },
      { id: 2, status: { key: 'selected' } },
    ]);
    manager.findOneOrFail.mockResolvedValue({
      id: 1,
      status: { key: 'selected' },
    });

    const result = await service.select(1, 7);

    expect(manager.update).toHaveBeenCalledWith(Plan, [2], {
      idPlanStatus: statusIdByKey.generated,
    });
    expect(manager.update).toHaveBeenCalledWith(Plan, 1, {
      idPlanStatus: statusIdByKey.selected,
    });
    expect(result).toEqual({ id: 1, status: { key: 'selected' } });
  });

  it('selects the plan without touching siblings when none were previously selected', async () => {
    planQueryBuilder.getOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      idPlanRequest: 10,
      status: { key: 'generated' },
    });
    manager.find.mockResolvedValue([
      { id: 1, status: { key: 'generated' } },
      { id: 2, status: { key: 'generated' } },
    ]);
    manager.findOneOrFail.mockResolvedValue({
      id: 1,
      status: { key: 'selected' },
    });

    await service.select(1, 7);

    expect(manager.update).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(Plan, 1, {
      idPlanStatus: statusIdByKey.selected,
    });
  });
});
