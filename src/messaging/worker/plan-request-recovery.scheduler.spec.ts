import { DataSource } from 'typeorm';
import { JobType } from '../types/job-type';
import { MessagingService } from '../messaging.service';
import { PlanRequestRecoveryScheduler } from './plan-request-recovery.scheduler';

describe('PlanRequestRecoveryScheduler (recovery sweep)', () => {
  let scheduler: PlanRequestRecoveryScheduler;
  let dataSource: jest.Mocked<
    Pick<DataSource, 'query' | 'transaction' | 'createQueryBuilder'>
  >;
  let messaging: jest.Mocked<Pick<MessagingService, 'publish'>>;
  let transactionManager: { query: jest.Mock };
  let statusQueryBuilder: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };

  beforeEach(() => {
    transactionManager = { query: jest.fn() };
    statusQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ id: 4 }),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(
        (runInTransaction: (manager: typeof transactionManager) => unknown) =>
          Promise.resolve(runInTransaction(transactionManager)),
      ),
      createQueryBuilder: jest.fn().mockReturnValue(statusQueryBuilder),
    };

    messaging = { publish: jest.fn().mockResolvedValue('job-id') };

    scheduler = new PlanRequestRecoveryScheduler(
      dataSource as unknown as DataSource,
      messaging as unknown as MessagingService,
    );
  });

  it('does nothing when there are no stale or orphan requests', async () => {
    dataSource.query.mockResolvedValue([]);

    await scheduler.recoverStuckRequests();

    expect(messaging.publish).not.toHaveBeenCalled();
  });

  it('republishes a stale processing request that has not exhausted attempts', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([]);
    transactionManager.query.mockResolvedValue([[{ recovery_attempts: 1 }], 1]);

    await scheduler.recoverStuckRequests();

    expect(messaging.publish).toHaveBeenCalledWith(
      JobType.GeneratePlanRequest,
      { planRequestId: 1 },
    );
  });

  it('republishes an orphaned pending request that has not exhausted attempts', async () => {
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 2 }]);
    transactionManager.query.mockResolvedValue([[{ recovery_attempts: 1 }], 1]);

    await scheduler.recoverStuckRequests();

    expect(messaging.publish).toHaveBeenCalledWith(
      JobType.GeneratePlanRequest,
      { planRequestId: 2 },
    );
  });

  it('marks a request permanently failed once recovery attempts are exhausted, without republishing', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 1 }]) // stale processing select
      .mockResolvedValueOnce(undefined) // markFailed UPDATE for that stale item
      .mockResolvedValueOnce([]); // orphan pending select
    transactionManager.query.mockResolvedValue([[{ recovery_attempts: 3 }], 1]);

    await scheduler.recoverStuckRequests();

    expect(messaging.publish).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE plan_request'),
      [4, 'GENERATION_UNAVAILABLE', 1],
    );
  });

  it('skips a request that another sweep execution already claimed (UPDATE affected 0 rows)', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([]);
    transactionManager.query.mockResolvedValue([[], 0]);

    await scheduler.recoverStuckRequests();

    expect(messaging.publish).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });

  it('continues processing remaining requests when one recovery attempt fails', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([]);
    dataSource.transaction
      .mockImplementationOnce(() => Promise.reject(new Error('db error')))
      .mockImplementationOnce(
        (runInTransaction: (manager: typeof transactionManager) => unknown) =>
          Promise.resolve(runInTransaction(transactionManager)),
      );
    transactionManager.query.mockResolvedValue([[{ recovery_attempts: 1 }], 1]);

    await scheduler.recoverStuckRequests();

    expect(messaging.publish).toHaveBeenCalledWith(
      JobType.GeneratePlanRequest,
      { planRequestId: 2 },
    );
  });
});
