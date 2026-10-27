import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { KnowledgeRefreshScheduler } from './knowledge-refresh.scheduler';

describe('knowledge scheduler startup', () => {
  it('does not hold worker readiness while the initial source refresh is slow', async () => {
    const scheduler = new KnowledgeRefreshScheduler(
      {
        query: jest.fn().mockResolvedValue([{ active: '0' }]),
      } as unknown as DataSource,
      new ConfigService({ KNOWLEDGE_SCHEDULER_ENABLED: true }),
    );
    jest
      .spyOn(scheduler, 'cinemas')
      .mockReturnValue(new Promise(() => undefined));
    await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
  });
  it.each([false, true])(
    'keeps fetching opt-in (enabled: %s)',
    async (enabled) => {
      const query = jest.fn().mockResolvedValue([{ active: '0' }]);
      const scheduler = new KnowledgeRefreshScheduler(
        { query } as unknown as DataSource,
        new ConfigService({ KNOWLEDGE_SCHEDULER_ENABLED: enabled }),
      );
      const refresh = jest.spyOn(scheduler, 'cinemas').mockResolvedValue();
      await scheduler.onModuleInit();
      expect(refresh).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(query).toHaveBeenCalledTimes(enabled ? 1 : 0);
    },
  );

  it('reuses fresh inventory without a startup source request', async () => {
    const scheduler = new KnowledgeRefreshScheduler(
      {
        query: jest.fn().mockResolvedValue([{ active: '42' }]),
      } as unknown as DataSource,
      new ConfigService({ KNOWLEDGE_SCHEDULER_ENABLED: 'true' }),
    );
    const refresh = jest.spyOn(scheduler, 'cinemas').mockResolvedValue();
    await scheduler.onModuleInit();
    expect(refresh).not.toHaveBeenCalled();
  });
});
