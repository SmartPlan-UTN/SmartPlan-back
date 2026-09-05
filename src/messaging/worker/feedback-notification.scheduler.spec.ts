import { DataSource } from 'typeorm';
import { Notification } from '../../administration/entities/notification.entity';
import { FeedbackNotificationScheduler } from './feedback-notification.scheduler';

describe('FeedbackNotificationScheduler (CU23)', () => {
  let scheduler: FeedbackNotificationScheduler;
  let dataSource: jest.Mocked<Pick<DataSource, 'query' | 'transaction'>>;
  let manager: { query: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    manager = {
      query: jest.fn(),
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(
        (runInTransaction: (manager: typeof manager) => unknown) =>
          Promise.resolve(runInTransaction(manager)),
      ),
    };

    scheduler = new FeedbackNotificationScheduler(
      dataSource as unknown as DataSource,
    );
  });

  it('does nothing when no plan is eligible', async () => {
    dataSource.query.mockResolvedValue([]);

    await scheduler.requestPendingFeedback();

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('marks an eligible plan and creates a notification atomically', async () => {
    dataSource.query.mockResolvedValue([
      { id: 1, id_user: 7, title: 'Wine tasting afternoon' },
    ]);
    manager.query.mockResolvedValue([[{ id: 1 }], 1]);

    await scheduler.requestPendingFeedback();

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE plan SET feedback_requested_at'),
      [1],
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idUser: 7,
        resourceType: 'plan',
        resourceId: 1,
      }),
    );
  });

  it('excludes plans that already have feedback from both the selection and the conditional UPDATE', async () => {
    dataSource.query.mockResolvedValue([
      { id: 1, id_user: 7, title: 'Wine tasting afternoon' },
    ]);
    manager.query.mockResolvedValue([[{ id: 1 }], 1]);

    await scheduler.requestPendingFeedback();

    const selectSql = String(dataSource.query.mock.calls[0][0]);
    expect(selectSql).toMatch(/NOT EXISTS[\s\S]*FROM feedback/i);
    expect(selectSql).toMatch(/feedback\.deleted_at IS NULL/i);

    const updateSql = String((manager.query.mock.calls[0] as unknown[])[0]);
    expect(updateSql).toMatch(/NOT EXISTS[\s\S]*FROM feedback/i);
    expect(updateSql).toMatch(/feedback\.deleted_at IS NULL/i);
  });

  it('skips the notification when the UPDATE affects no rows (already requested concurrently)', async () => {
    dataSource.query.mockResolvedValue([
      { id: 1, id_user: 7, title: 'Wine tasting afternoon' },
    ]);
    manager.query.mockResolvedValue([[], 0]);

    await scheduler.requestPendingFeedback();

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('continues processing remaining plans when one fails', async () => {
    dataSource.query.mockResolvedValue([
      { id: 1, id_user: 7, title: 'Plan A' },
      { id: 2, id_user: 8, title: 'Plan B' },
    ]);
    dataSource.transaction
      .mockImplementationOnce(() => Promise.reject(new Error('db error')))
      .mockImplementationOnce(
        (runInTransaction: (manager: typeof manager) => unknown) =>
          Promise.resolve(runInTransaction(manager)),
      );
    manager.query.mockResolvedValue([[{ id: 2 }], 1]);

    await expect(scheduler.requestPendingFeedback()).resolves.toBeUndefined();

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 2 }),
    );
  });

  it('creates exactly one notification under two concurrent executions for the same plan', async () => {
    dataSource.query.mockResolvedValue([
      { id: 1, id_user: 7, title: 'Wine tasting afternoon' },
    ]);

    let claimed = false;
    dataSource.transaction.mockImplementation(
      (runInTransaction: (manager: typeof manager) => unknown) => {
        const raceManager = {
          ...manager,
          query: jest.fn().mockImplementation(() => {
            if (claimed) return Promise.resolve([[], 0]);
            claimed = true;
            return Promise.resolve([[{ id: 1 }], 1]);
          }),
        };
        return Promise.resolve(runInTransaction(raceManager));
      },
    );

    await Promise.all([
      scheduler.requestPendingFeedback(),
      scheduler.requestPendingFeedback(),
    ]);

    expect(manager.save).toHaveBeenCalledTimes(1);
  });
});
