import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalSyncService } from './external-sync.service';
import { EXTERNAL_SYNC_STATUS } from './external-sync-status';

describe('ExternalSyncService', () => {
  let service: ExternalSyncService;
  let repository: jest.Mocked<Pick<Repository<ExternalSync>, 'update'>>;

  beforeEach(async () => {
    repository = { update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalSyncService,
        { provide: getRepositoryToken(ExternalSync), useValue: repository },
      ],
    }).compile();

    service = module.get(ExternalSyncService);
  });

  describe('run', () => {
    it('closes the run as completed with recordCount 0 (CU49)', async () => {
      await service.run(7);

      expect(repository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          status: EXTERNAL_SYNC_STATUS.COMPLETED,
          recordCount: 0,
          endedAt: expect.any(Date) as Date,
        }),
      );
    });
  });

  describe('markFailed', () => {
    it('marks the run as failed with the error message (CU49)', async () => {
      await service.markFailed(7, new Error('boom'));

      expect(repository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          status: EXTERNAL_SYNC_STATUS.FAILED,
          errorMessage: 'boom',
          endedAt: expect.any(Date) as Date,
        }),
      );
    });

    it('stringifies a non-Error value as the error message (CU49)', async () => {
      await service.markFailed(7, 'raw failure');

      expect(repository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ errorMessage: 'raw failure' }),
      );
    });
  });
});
