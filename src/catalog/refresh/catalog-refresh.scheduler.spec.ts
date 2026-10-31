import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { EnvironmentVariables } from '../../config/environment-variables';
import type { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import type { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import type { MessagingService } from '../../messaging/messaging.service';
import { CatalogRefreshScheduler } from './catalog-refresh.scheduler';

const NOW = new Date('2026-11-01T08:00:00Z');

function scheduler(running: Partial<ExternalSync>[]) {
  const syncs = {
    exist: jest.fn().mockResolvedValue(false),
    find: jest.fn().mockResolvedValue(running),
    update: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: object) => Promise.resolve({ id: 9, ...value })),
  };
  const manager = {
    query: jest.fn(),
    getRepository: jest.fn(() => syncs),
  };
  const repository = {
    manager: {
      transaction: jest.fn((work: (m: typeof manager) => unknown) =>
        work(manager),
      ),
    },
  };
  const messaging = { publish: jest.fn() };
  const service = new CatalogRefreshScheduler(
    {
      findOneOrFail: jest.fn().mockResolvedValue({ id: 3 }),
    } as unknown as Repository<ExternalProvider>,
    repository as unknown as Repository<ExternalSync>,
    messaging as unknown as MessagingService,
    {} as ConfigService<EnvironmentVariables, true>,
  );
  return { service, manager, syncs, messaging };
}

describe('CatalogRefreshScheduler', () => {
  it('creates and queues the run under a lock for its period', async () => {
    const { service, manager, messaging } = scheduler([]);
    await expect(service.run(NOW)).resolves.toBe(9);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [expect.stringContaining('2026-11')],
    );
    expect(messaging.publish).toHaveBeenCalledTimes(1);
  });

  it('never starts a second run while one is in flight', async () => {
    const { service, syncs, messaging } = scheduler([
      { id: 1, startedAt: new Date(NOW.getTime() - 60_000) },
    ]);
    await expect(service.run(NOW)).resolves.toBeNull();
    expect(syncs.save).not.toHaveBeenCalled();
    expect(messaging.publish).not.toHaveBeenCalled();
  });
});
