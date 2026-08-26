import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../../database/seeds/definitions';
import { MessagingService } from '../../messaging/messaging.service';
import { JobType } from '../../messaging/types/job-type';
import { ExternalProvider } from '../entities/external-provider.entity';
import { ExternalSync } from '../entities/external-sync.entity';
import { EXTERNAL_SYNC_STATUS } from '../external-sync-status';
import { ExternalSyncScheduler } from './external-sync.scheduler';

describe('ExternalSyncScheduler', () => {
  let scheduler: ExternalSyncScheduler;
  let providerRepository: jest.Mocked<
    Pick<Repository<ExternalProvider>, 'findOneOrFail'>
  >;
  let syncRepository: jest.Mocked<
    Pick<Repository<ExternalSync>, 'create' | 'save' | 'update' | 'find'>
  >;
  let messaging: jest.Mocked<Pick<MessagingService, 'publish'>>;
  let configuration: { get: jest.Mock };

  const provider = { id: 1, key: GOOGLE_MAPS_PROVIDER_KEY } as ExternalProvider;
  const createdRun = { id: 42 } as ExternalSync;

  beforeEach(async () => {
    providerRepository = {
      findOneOrFail: jest.fn().mockResolvedValue(provider),
    };
    syncRepository = {
      create: jest.fn().mockReturnValue(createdRun),
      save: jest.fn().mockResolvedValue(createdRun),
      update: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    messaging = { publish: jest.fn().mockResolvedValue('job-id') };
    configuration = { get: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalSyncScheduler,
        {
          provide: getRepositoryToken(ExternalProvider),
          useValue: providerRepository,
        },
        { provide: getRepositoryToken(ExternalSync), useValue: syncRepository },
        { provide: MessagingService, useValue: messaging },
        { provide: ConfigService, useValue: configuration },
      ],
    }).compile();

    scheduler = module.get(ExternalSyncScheduler);
  });

  it('creates a running external_sync row and publishes the sync job with its id (CU49)', async () => {
    await scheduler.run();

    expect(syncRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idExternalProvider: provider.id,
        status: EXTERNAL_SYNC_STATUS.RUNNING,
      }),
    );
    expect(syncRepository.save).toHaveBeenCalledWith(createdRun);
    expect(messaging.publish).toHaveBeenCalledWith(JobType.SyncExternalPlaces, {
      externalSyncId: createdRun.id,
    });
  });

  it('skips the trigger while a recent run is still in flight (CU49)', async () => {
    syncRepository.find.mockResolvedValue([
      { id: 41, startedAt: new Date() } as ExternalSync,
    ]);

    await scheduler.run();

    expect(syncRepository.create).not.toHaveBeenCalled();
    expect(messaging.publish).not.toHaveBeenCalled();
  });

  it('closes a run stuck in running and starts a new one (CU49)', async () => {
    const stale = new Date(Date.now() - 7 * 60 * 60 * 1000);
    syncRepository.find.mockResolvedValue([
      { id: 41, startedAt: stale } as ExternalSync,
    ]);

    await scheduler.run();

    expect(syncRepository.update).toHaveBeenCalledWith(
      41,
      expect.objectContaining({
        status: EXTERNAL_SYNC_STATUS.FAILED,
        endedAt: expect.any(Date) as Date,
      }),
    );
    expect(messaging.publish).toHaveBeenCalledWith(JobType.SyncExternalPlaces, {
      externalSyncId: createdRun.id,
    });
  });

  it('does not trigger the cron when the scheduler is disabled on this instance (CU49)', async () => {
    configuration.get.mockReturnValue(false);

    await scheduler.triggerSync();

    expect(messaging.publish).not.toHaveBeenCalled();
  });

  it('swallows and logs a failure so the cron never rejects (CU49)', async () => {
    providerRepository.findOneOrFail.mockRejectedValue(new Error('no seed'));

    await expect(scheduler.triggerSync()).resolves.toBeUndefined();
  });

  it('marks the run as failed and propagates the error when publishing fails (CU49)', async () => {
    const publishError = new Error('broker unreachable');
    messaging.publish.mockRejectedValue(publishError);

    await expect(scheduler.run()).rejects.toThrow(publishError);

    expect(syncRepository.update).toHaveBeenCalledWith(
      createdRun.id,
      expect.objectContaining({
        status: EXTERNAL_SYNC_STATUS.FAILED,
        errorMessage: 'broker unreachable',
        endedAt: expect.any(Date) as Date,
      }),
    );
  });
});
