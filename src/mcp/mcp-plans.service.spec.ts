import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlanVisibility } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { MediaService } from '../media/media.service';
import { McpOwnerService } from './mcp-owner.service';
import {
  mcpPlanCost,
  McpPlansService,
  requestIdForSource,
} from './mcp-plans.service';

describe('McpPlansService', () => {
  const manager = { findOne: jest.fn(), find: jest.fn() };
  const plans = { loadFromMcp: jest.fn() };
  const owner = { resolveOwnerId: jest.fn().mockResolvedValue(5) };
  const media = {
    replaceGalleryFromStaged: jest.fn(),
    checkStaged: jest.fn(),
  };
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
    peopleCount: 2,
    estimatedTotalCost: 100,
    estimatedTotalCostMax: 100,
    estimatedCostPerPerson: 50,
    unpricedCount: 0,
    priceCompleteness: 'EXACT',
  };
  const created = { plan: saved, existed: false };

  beforeEach(() => {
    jest.clearAllMocks();
    owner.resolveOwnerId.mockResolvedValue(5);
  });

  it('derives a stable UUID from the source id', () => {
    expect(requestIdForSource('a')).toBe(requestIdForSource('a'));
    expect(requestIdForSource('a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('returns the known cost for a created plan with an unpriced stop', async () => {
    plans.loadFromMcp.mockResolvedValue({
      plan: {
        ...saved,
        estimatedTotalCost: 0,
        estimatedTotalCostMax: 0,
        estimatedCostPerPerson: 0,
        unpricedCount: 1,
        priceCompleteness: 'PARTIAL',
      },
      existed: false,
    });
    const [result] = await service.load([plan]);
    expect(result).toMatchObject({
      estimatedTotalCost: 0,
      estimatedCostPerPerson: 0,
      unpricedCount: 1,
      priceCompleteness: 'PARTIAL',
    });
  });

  it('creates a public confirmed plan by default keeping the itinerary order', async () => {
    plans.loadFromMcp.mockResolvedValue(created);
    const [result] = await service.load([plan]);
    expect(result).toMatchObject({ status: 'created', planId: 10 });
    const [ownerId, dto, status, options] = plans.loadFromMcp.mock.calls[0] as [
      number,
      { visibility: string; stops: Array<{ activityId: number }> },
      string,
      { dryRun: boolean },
    ];
    expect(ownerId).toBe(5);
    expect(status).toBe('confirmed');
    expect(options).toEqual({ dryRun: false });
    expect(dto.visibility).toBe('public');
    expect(dto.stops.map((stop) => stop.activityId)).toEqual([3, 1]);
  });

  it('updates the plan already loaded with the same source id', async () => {
    plans.loadFromMcp.mockResolvedValue({
      plan: { ...saved, status: { key: 'completed' } },
      existed: true,
    });
    const [result] = await service.load([{ ...plan, status: 'completed' }]);
    expect(result).toMatchObject({
      status: 'updated',
      planId: 10,
      planStatus: 'completed',
    });
    expect(plans.loadFromMcp).toHaveBeenCalledWith(
      5,
      expect.anything(),
      'completed',
      { dryRun: false },
    );
  });

  it('reports each invalid plan without stopping the batch', async () => {
    plans.loadFromMcp
      .mockRejectedValueOnce(
        new ConflictException({
          code: 'ACTIVITY_NOT_PLAN_ELIGIBLE',
          message: 'nope',
        }),
      )
      .mockResolvedValueOnce(created);
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
    expect(plans.loadFromMcp).not.toHaveBeenCalled();
  });

  it('replaces the plan gallery when images are sent', async () => {
    plans.loadFromMcp.mockResolvedValue(created);
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
    plans.loadFromMcp.mockResolvedValue(created);
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

  describe('dryRun', () => {
    it('runs the load as a dry run and only checks the images', async () => {
      plans.loadFromMcp.mockResolvedValue(created);
      media.checkStaged.mockResolvedValue([]);
      const images = [{ objectKey: 'staging/mcp/a' }];
      const [result] = await service.load([{ ...plan, images }], {
        dryRun: true,
      });
      expect(plans.loadFromMcp).toHaveBeenCalledWith(
        5,
        expect.anything(),
        'confirmed',
        { dryRun: true },
      );
      expect(result).toMatchObject({
        status: 'would_create',
        estimatedTotalCost: 100,
        estimatedCostPerPerson: 50,
        priceCompleteness: 'EXACT',
        images: { status: 'would_replace' },
      });
      // The id of a would_create belongs to a rolled-back row.
      expect(result.planId).toBeUndefined();
      expect(media.checkStaged).toHaveBeenCalledWith(['staging/mcp/a']);
      expect(media.replaceGalleryFromStaged).not.toHaveBeenCalled();
    });

    it('reports would_update with the plan it would overwrite', async () => {
      plans.loadFromMcp.mockResolvedValue({ plan: saved, existed: true });
      const [result] = await service.load([plan], { dryRun: true });
      expect(result).toMatchObject({ status: 'would_update', planId: 10 });
    });

    it('keeps the plan result when only an image would fail, like the real load', async () => {
      plans.loadFromMcp.mockResolvedValue(created);
      media.checkStaged.mockResolvedValue([
        { objectKey: 'staging/mcp/a', error: 'staged image not found' },
      ]);
      const [result] = await service.load(
        [{ ...plan, images: [{ objectKey: 'staging/mcp/a' }] }],
        { dryRun: true },
      );
      expect(result.status).toBe('would_create');
      expect(result.images).toEqual({
        status: 'error',
        images: [],
        errors: [
          { objectKey: 'staging/mcp/a', error: 'staged image not found' },
        ],
      });
    });

    it('reports what the real load would reject', async () => {
      plans.loadFromMcp.mockRejectedValue(
        new ConflictException({
          code: 'PLAN_REMOVED_BY_MODERATION',
          message: 'removed',
        }),
      );
      const [result] = await service.load([{ ...plan, visibility: 'public' }], {
        dryRun: true,
      });
      expect(result.status).toBe('error');
      expect(result.errors[0]).toContain('PLAN_REMOVED_BY_MODERATION');
    });
  });

  describe('mcpPlanCost', () => {
    it('carries the range and the per-person cost the plan already has', () => {
      expect(
        mcpPlanCost({
          estimatedTotalCost: 1000,
          estimatedTotalCostMax: 3000,
          estimatedCostPerPerson: 500,
          unpricedCount: 0,
          priceCompleteness: 'RANGE',
        }),
      ).toEqual({
        estimatedTotalCost: 1000,
        estimatedTotalCostMax: 3000,
        estimatedCostPerPerson: 500,
        unpricedCount: 0,
        priceCompleteness: 'RANGE',
      });
    });
  });
});
