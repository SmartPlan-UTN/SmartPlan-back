import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlanVisibility } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { MediaService } from '../media/media.service';
import { McpOwnerService } from './mcp-owner.service';
import { McpPlansService, requestIdForSource } from './mcp-plans.service';

describe('McpPlansService', () => {
  const manager = { findOne: jest.fn(), find: jest.fn() };
  const plans = { createFromComposer: jest.fn(), setStatus: jest.fn() };
  const owner = { resolveOwnerId: jest.fn().mockResolvedValue(5) };
  const media = { replaceGalleryFromStaged: jest.fn() };
  const service = new McpPlansService(
    { manager } as unknown as DataSource,
    plans as unknown as PlansService,
    owner as unknown as McpOwnerService,
    media as unknown as MediaService,
  );
  const plan = {
    sourceId: 'bot-1',
    title: 'Tarde de vinos',
    peopleCount: 2,
    activities: [{ activityId: 3 }, { activityId: 1 }],
  };
  const saved = {
    id: 10,
    status: { key: 'confirmed' },
    visibility: PlanVisibility.Private,
    estimatedTotalCost: 100,
    estimatedCostPerPerson: 50,
  };

  beforeEach(() => owner.resolveOwnerId.mockResolvedValue(5));

  it('derives a stable UUID from the source id', () => {
    expect(requestIdForSource('a')).toBe(requestIdForSource('a'));
    expect(requestIdForSource('a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('creates a private confirmed plan keeping the itinerary order', async () => {
    manager.findOne.mockResolvedValue(null);
    plans.createFromComposer.mockResolvedValue(saved);
    const [result] = await service.load([plan]);
    expect(result).toMatchObject({ status: 'created', planId: 10 });
    const [ownerId, dto, status] = plans.createFromComposer.mock.calls[0] as [
      number,
      { visibility: string; stops: Array<{ activityId: number }> },
      string,
    ];
    expect(ownerId).toBe(5);
    expect(status).toBe('confirmed');
    expect(dto.visibility).toBe('private');
    expect(dto.stops.map((stop) => stop.activityId)).toEqual([3, 1]);
  });

  it('updates the plan already loaded with the same source id', async () => {
    manager.findOne.mockResolvedValue({ id: 10, status: { key: 'completed' } });
    plans.createFromComposer.mockResolvedValue(saved);
    plans.setStatus.mockResolvedValue({
      ...saved,
      status: { key: 'completed' },
    });
    const [result] = await service.load([{ ...plan, status: 'completed' }]);
    expect(result).toMatchObject({
      status: 'updated',
      planStatus: 'completed',
    });
    expect(plans.setStatus).toHaveBeenNthCalledWith(1, 5, 10, 'confirmed');
    expect(plans.setStatus).toHaveBeenNthCalledWith(2, 5, 10, 'completed');
  });

  it('reports each invalid plan without stopping the batch', async () => {
    manager.findOne.mockResolvedValue(null);
    plans.createFromComposer
      .mockRejectedValueOnce(
        new ConflictException({
          code: 'ACTIVITY_NOT_PLAN_ELIGIBLE',
          message: 'nope',
        }),
      )
      .mockResolvedValueOnce(saved);
    const results = await service.load([
      { title: 'missing fields' },
      plan,
      { ...plan, sourceId: 'bot-2' },
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'error',
      'error',
      'created',
    ]);
    expect(results[1].errors[0]).toContain('ACTIVITY_NOT_PLAN_ELIGIBLE');
  });

  it('rejects a public cancelled plan', async () => {
    const [result] = await service.load([
      { ...plan, status: 'cancelled', visibility: 'public' },
    ]);
    expect(result.status).toBe('error');
    expect(plans.createFromComposer).not.toHaveBeenCalled();
  });

  it('replaces the plan gallery when images are sent', async () => {
    manager.findOne.mockResolvedValue(null);
    plans.createFromComposer.mockResolvedValue(saved);
    media.replaceGalleryFromStaged.mockResolvedValue({
      images: [
        { id: 1, isPrimary: false },
        { id: 2, isPrimary: true },
      ],
      errors: [],
    });
    const images = [
      { objectKey: 'staging/mcp/a' },
      { objectKey: 'staging/mcp/b', isCover: true },
    ];
    const [result] = await service.load([{ ...plan, images }]);
    expect(media.replaceGalleryFromStaged).toHaveBeenCalledWith(
      'plan',
      10,
      images,
    );
    expect(result.images?.status).toBe('replaced');
  });

  it('leaves the gallery alone when images are not sent', async () => {
    manager.findOne.mockResolvedValue(null);
    plans.createFromComposer.mockResolvedValue(saved);
    const [result] = await service.load([plan]);
    expect(media.replaceGalleryFromStaged).not.toHaveBeenCalled();
    expect(result.images).toBeUndefined();
  });

  it('rejects two covers', async () => {
    const [result] = await service.load([
      {
        ...plan,
        images: [
          { objectKey: 'staging/mcp/a', isCover: true },
          { objectKey: 'staging/mcp/b', isCover: true },
        ],
      },
    ]);
    expect(result.status).toBe('error');
  });
});
