import { DataSource, EntityManager } from 'typeorm';
import { MediaService } from '../media/media.service';
import { PlanStatus } from './entities/plan-status.entity';
import { PlansService } from './plans.service';
import { OutingsService } from './outings.service';

describe('OutingsService gallery copy', () => {
  it('copies image rows with the plan and itinerary in the same transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 77 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 3 } as PlanStatus),
      query,
    } as unknown as EntityManager;
    const service = new OutingsService(
      {} as DataSource,
      {} as PlansService,
      {} as MediaService,
    );

    const copy = service as unknown as {
      copyAsOuting: (
        manager: EntityManager,
        userId: number,
        sourceId: number,
        originalId: number,
      ) => Promise<{ outingId: number; created: boolean }>;
    };
    await expect(copy.copyAsOuting(manager, 5, 11, 11)).resolves.toEqual({
      outingId: 77,
      created: true,
    });
    expect(query).toHaveBeenCalledTimes(3);
    const calls = query.mock.calls as unknown as Array<[string, number[]]>;
    expect(calls[2][0]).toContain('INSERT INTO "plan_image"');
    expect(calls[2][0]).toContain('SELECT $1, "object_key"');
    expect(calls[2][1]).toEqual([77, 11]);
  });
});
