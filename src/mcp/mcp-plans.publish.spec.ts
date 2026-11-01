import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MediaService } from '../media/media.service';
import { PlanVisibility } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { McpOwnerService } from './mcp-owner.service';
import { McpPlansService } from './mcp-plans.service';

describe('McpPlansService visibility (public by default)', () => {
  const qb = {
    innerJoin: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };
  for (const key of ['innerJoin', 'select', 'where', 'andWhere', 'orderBy'])
    qb[key as keyof typeof qb].mockReturnValue(qb);
  const dataSource = {
    manager: { findOne: jest.fn(), find: jest.fn() },
    getRepository: () => ({ createQueryBuilder: () => qb }),
  };
  const plans = { loadFromMcp: jest.fn(), setVisibility: jest.fn() };
  const owner = { resolveOwnerId: jest.fn().mockResolvedValue(5) };
  const service = new McpPlansService(
    dataSource as unknown as DataSource,
    plans as unknown as PlansService,
    owner as unknown as McpOwnerService,
    {} as MediaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    owner.resolveOwnerId.mockResolvedValue(5);
    qb.getMany.mockResolvedValue([
      { id: 1, title: 'Vinos' },
      { id: 2, title: 'Vacío' },
    ]);
  });

  it('defaults a cancelled plan to private', async () => {
    jest
      .spyOn(
        service as unknown as { resolveActivityIds: () => unknown },
        'resolveActivityIds',
      )
      .mockResolvedValue({ ids: [1] });
    plans.loadFromMcp.mockRejectedValue(new Error('stop'));
    await service.load([
      {
        sourceId: 'c',
        title: 'x',
        peopleCount: 1,
        status: 'cancelled',
        activities: [{ activityId: 1 }],
      },
    ]);
    const [, dto] = plans.loadFromMcp.mock.calls[0] as [
      number,
      { visibility: string },
    ];
    expect(dto.visibility).toBe(PlanVisibility.Private);
  });

  it('publishes the MCP owner private plans, reporting each one', async () => {
    plans.setVisibility
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new ConflictException({ code: 'PLAN_EMPTY', message: 'empty' }),
      );
    const results = await service.publishLoaded();
    expect(plans.setVisibility).toHaveBeenCalledWith(
      5,
      1,
      PlanVisibility.Public,
    );
    expect(results.map((r) => r.status)).toEqual(['published', 'error']);
    expect(results[1].errors[0]).toContain('PLAN_EMPTY');
    expect(qb.andWhere).toHaveBeenCalledWith(
      '"plan"."composer_request_id"::text ~ :pattern',
      expect.anything(),
    );
    expect(qb.where).toHaveBeenCalledWith('plan.idUser = :ownerId', {
      ownerId: 5,
    });
  });

  it('only previews with dryRun and can be limited to planIds', async () => {
    const results = await service.publishLoaded({ planIds: [1], dryRun: true });
    expect(plans.setVisibility).not.toHaveBeenCalled();
    expect(results.every((r) => r.status === 'would_publish')).toBe(true);
    expect(qb.andWhere).toHaveBeenCalledWith('plan.id IN (:...ids)', {
      ids: [1],
    });
  });
});
