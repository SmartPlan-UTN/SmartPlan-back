import { Test, TestingModule } from '@nestjs/testing';
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
    Pick<Repository<ExternalSync>, 'create' | 'save' | 'update'>
  >;
  let messaging: jest.Mocked<Pick<MessagingService, 'publish'>>;

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
    };
    messaging = { publish: jest.fn().mockResolvedValue('job-id') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalSyncScheduler,
        {
          provide: getRepositoryToken(ExternalProvider),
          useValue: providerRepository,
        },
        { provide: getRepositoryToken(ExternalSync), useValue: syncRepository },
        { provide: MessagingService, useValue: messaging },
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
