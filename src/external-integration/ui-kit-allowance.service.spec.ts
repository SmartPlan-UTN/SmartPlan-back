import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { UiKitAllowanceService } from './ui-kit-allowance.service';

function fakeDataSource(alreadyUsed: number) {
  const saved: unknown[] = [];
  const queries: string[] = [];
  const repository = {
    createQueryBuilder: () => {
      const builder = {
        where: () => builder,
        andWhere: () => builder,
        getCount: () => Promise.resolve(alreadyUsed + saved.length),
      };
      return builder;
    },
    findOneOrFail: () => Promise.resolve({ id: 1 }),
    create: (row: unknown) => row,
    save: (rows: unknown[]) => {
      saved.push(...rows);
      return Promise.resolve(rows);
    },
  };
  const manager = {
    query: (sql: string) => {
      queries.push(sql);
      return Promise.resolve([]);
    },
    getRepository: () => repository,
  };
  const dataSource = {
    transaction: (work: (m: typeof manager) => Promise<unknown>) =>
      work(manager),
  } as unknown as DataSource;
  return { dataSource, saved, queries };
}

function config(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('UiKitAllowanceService', () => {
  it('grants what was asked while the month is under the cap, under an advisory lock', async () => {
    const { dataSource, saved, queries } = fakeDataSource(100);
    const service = new UiKitAllowanceService(dataSource, config({}));

    await expect(service.claim(12, 'explore')).resolves.toEqual({
      granted: 12,
      remaining: 9000 - 112,
    });
    expect(saved).toHaveLength(12);
    expect(queries[0]).toContain('pg_advisory_xact_lock');
  });

  it('never grants past the USD 0 cap', async () => {
    const { dataSource, saved } = fakeDataSource(8995);
    const service = new UiKitAllowanceService(dataSource, config({}));

    await expect(service.claim(12, 'explore')).resolves.toEqual({
      granted: 5,
      remaining: 0,
    });
    expect(saved).toHaveLength(5);

    const full = fakeDataSource(9000);
    await expect(
      new UiKitAllowanceService(full.dataSource, config({})).claim(3, 'x'),
    ).resolves.toEqual({ granted: 0, remaining: 0 });
    expect(full.saved).toHaveLength(0);
  });

  it('cannot be configured above the free allowance', () => {
    const { dataSource } = fakeDataSource(0);
    const service = new UiKitAllowanceService(
      dataSource,
      config({ GOOGLE_UI_KIT_MONTHLY_CAP: 50_000 }),
    );
    expect(service.monthlyCap()).toBe(9000);
  });

  it('grants nothing while the Google kill switch is off', async () => {
    const { dataSource } = fakeDataSource(0);
    const service = new UiKitAllowanceService(
      dataSource,
      config({ GOOGLE_PLACES_ENABLED: false }),
    );
    await expect(service.claim(4, 'explore')).resolves.toEqual({
      granted: 0,
      remaining: 0,
    });
  });

  it('caps a single claim at one page of cards', async () => {
    const { dataSource } = fakeDataSource(0);
    const service = new UiKitAllowanceService(dataSource, config({}));
    const result = await service.claim(500, 'explore');
    expect(result.granted).toBe(24);
  });
});
