import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { AuditLog } from '../administration/entities/audit-log.entity';
import { MediaService } from '../media/media.service';
import { ListOwnPlansQueryDto } from './dto/list-own-plans-query.dto';
import { Plan, PlanKind, PlanVisibility } from './entities/plan.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { PlansService } from './plans.service';

function plan(overrides: Partial<Plan> = {}): Plan {
  return Object.assign(new Plan(), {
    id: 10,
    idUser: 42,
    title: 'A day in Mendoza',
    description: 'Original result',
    kind: PlanKind.Generated,
    visibility: PlanVisibility.Private,
    idPlanRequest: 7,
    idPlanStatus: 3,
    status: { key: 'generated', name: 'Generated' },
    peopleCount: 2,
    estimatedTotalCost: 100,
    estimatedTotalCostMax: 150,
    unpricedCount: 1,
    priceCompleteness: 'PARTIAL',
    estimatedTotalDuration: 90,
    travelDistanceMeters: 500,
    travelDurationSeconds: 300,
    details: [],
    ...overrides,
  });
}

describe('Generated plan history (CU17, CU25, CU29)', () => {
  let repository: jest.Mocked<Pick<Repository<Plan>, 'findAndCount' | 'find'>>;
  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: PlansService;
  const source = plan();
  const copy = plan({
    id: 20,
    kind: PlanKind.Authored,
    idSourcePlan: 10,
    idPlanRequest: null,
  });

  beforeEach(() => {
    repository = { findAndCount: jest.fn(), find: jest.fn() };
    manager = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((entity: new () => object, values: object) =>
        Object.assign(new entity(), values),
      ),
      save: jest.fn((entity: unknown) =>
        entity instanceof Plan ? { ...entity, id: 20 } : entity,
      ),
    };
    service = new PlansService(
      {
        transaction: (work: (transaction: EntityManager) => unknown) =>
          work(manager as unknown as EntityManager),
      } as unknown as DataSource,
      repository as unknown as Repository<Plan>,
      {} as MediaService,
    );
  });

  it('paginates only the current user results and links their editable copies', async () => {
    repository.findAndCount.mockResolvedValue([[source], 25]);
    repository.find.mockResolvedValue([copy]);
    const result = await service.listGenerated(
      42,
      Object.assign(new ListOwnPlansQueryDto(), { page: 2, limit: 12 }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 12,
      total: 25,
      totalPages: 3,
    });
    expect(result.data).toEqual([
      expect.objectContaining({ id: 10, planRequestId: 7, editablePlanId: 20 }),
    ]);
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idUser: 42,
          kind: PlanKind.Generated,
          status: { key: Not('cancelled') },
        },
        skip: 12,
        take: 12,
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idUser: 42,
          kind: PlanKind.Authored,
          status: { key: Not('cancelled') },
        }) as unknown,
      }),
    );
  });

  it('returns an empty history without querying copies', async () => {
    repository.findAndCount.mockResolvedValue([[], 0]);
    await expect(
      service.listGenerated(42, new ListOwnPlansQueryDto()),
    ).resolves.toMatchObject({ data: [], pagination: { total: 0 } });
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('propagates history failures so the client can retry', async () => {
    repository.findAndCount.mockRejectedValue(new Error('Unavailable'));
    await expect(
      service.listGenerated(42, new ListOwnPlansQueryDto()),
    ).rejects.toThrow('Unavailable');
  });

  function prepareCopy(existing: Plan | null = null) {
    manager.findOne
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce({ key: 'generated' })
      .mockResolvedValueOnce(existing);
    if (!existing)
      manager.findOne.mockResolvedValueOnce({ id: 4, key: 'confirmed' });
    manager.findOne.mockResolvedValueOnce(copy);
  }

  it('copies the itinerary and price snapshots into a private authored plan without changing the source', async () => {
    const detail = Object.assign(new PlanDetail(), {
      id: 101,
      idPlan: 10,
      idActivity: 8,
      order: 1,
      estimatedCost: 100,
      perPersonCost: 50,
      priceKind: 'RANGE',
      priceMin: 100,
      priceMax: 150,
      priceUnit: 'PER_PERSON',
      priceCurrency: 'ARS',
      priceSource: 'MANUAL',
      priceSourceRef: 'catalog',
      priceVerifiedAt: new Date('2026-10-01'),
      priceSnapshotAt: new Date('2026-10-02'),
      estimatedDuration: 85,
      note: 'Meet at the entrance',
      activity: { id: 8, name: 'Walk', estimatedDuration: 85 },
    });
    prepareCopy();
    manager.find.mockResolvedValue([detail]);
    manager.findOne.mockResolvedValueOnce(null);
    copy.details = [detail];
    const result = await service.copyGenerated(42, 10);
    expect(result.id).toBe(20);
    expect(manager.findOne).toHaveBeenNthCalledWith(1, Plan, {
      where: { id: 10, idUser: 42, kind: PlanKind.Generated },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.create).toHaveBeenCalledWith(
      Plan,
      expect.objectContaining({
        kind: PlanKind.Authored,
        visibility: PlanVisibility.Private,
        idSourcePlan: 10,
        idPlanRequest: null,
        idUser: 42,
        idPlanStatus: 4,
        estimatedTotalCost: 100,
        estimatedTotalCostMax: 150,
        priceCompleteness: 'PARTIAL',
        travelDistanceMeters: 500,
        travelDurationSeconds: 300,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(PlanDetail, [
      expect.objectContaining({
        idPlan: 20,
        idActivity: 8,
        order: 1,
        perPersonCost: 50,
        priceMin: 100,
        priceMax: 150,
        priceSnapshotAt: detail.priceSnapshotAt,
        note: detail.note,
      }),
    ]);
    expect(manager.save).toHaveBeenCalledWith(PlanDetail, [
      expect.not.objectContaining({ id: detail.id }),
    ]);
    expect(manager.create).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({ affectedEntityId: 20 }),
    );
    expect(source.kind).toBe(PlanKind.Generated);
    expect(detail.idPlan).toBe(10);
    copy.details = [];
  });

  it('resumes the existing copy on retries without writing another plan or audit entry', async () => {
    prepareCopy(copy);
    await expect(service.copyGenerated(42, 10)).resolves.toMatchObject({
      id: 20,
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.find).not.toHaveBeenCalled();
  });

  it('hides a missing, foreign, authored or outing source with the same 404', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.copyGenerated(99, 10)).rejects.toThrow(
      NotFoundException,
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      Plan,
      expect.objectContaining({
        where: { id: 10, idUser: 99, kind: PlanKind.Generated },
      }),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a cancelled source', async () => {
    manager.findOne
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce({ key: 'cancelled' });
    await expect(service.copyGenerated(42, 10)).rejects.toThrow(
      NotFoundException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
});
