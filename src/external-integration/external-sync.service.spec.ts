import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Place } from '../places/entities/place.entity';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalSyncService } from './external-sync.service';
import { EXTERNAL_SYNC_STATUS } from './external-sync-status';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { PermanentJobError } from '../messaging/errors/permanent-job-error';
import { RetryableJobError } from '../messaging/errors/retryable-job-error';

function activityPlace(overrides: Partial<ActivityPlace>): ActivityPlace {
  return {
    id: 1,
    idActivity: 1,
    idPlace: 1,
    latitude: null,
    longitude: null,
    notes: null,
    googlePlaceId: null,
    place: { id: 1, address: 'BUTE, Mendoza' } as Place,
    ...overrides,
  } as ActivityPlace;
}

describe('ExternalSyncService', () => {
  let service: ExternalSyncService;
  let externalSyncRepository: jest.Mocked<
    Pick<Repository<ExternalSync>, 'update'>
  >;
  let activityPlaceRepository: jest.Mocked<
    Pick<Repository<ActivityPlace>, 'find' | 'save'>
  >;
  let googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'searchPlace' | 'getPlaceDetails'>
  >;

  beforeEach(async () => {
    externalSyncRepository = { update: jest.fn() };
    activityPlaceRepository = { find: jest.fn(), save: jest.fn() };
    googleMaps = { searchPlace: jest.fn(), getPlaceDetails: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalSyncService,
        {
          provide: getRepositoryToken(ExternalSync),
          useValue: externalSyncRepository,
        },
        {
          provide: getRepositoryToken(ActivityPlace),
          useValue: activityPlaceRepository,
        },
        { provide: GoogleMapsClientService, useValue: googleMaps },
      ],
    }).compile();

    service = module.get(ExternalSyncService);
    activityPlaceRepository.save.mockImplementation((row) =>
      Promise.resolve(row as ActivityPlace),
    );
  });

  describe('run', () => {
    it('completes with recordCount 0 when there are no linked places (CU50)', async () => {
      activityPlaceRepository.find.mockResolvedValue([]);

      await service.run(7);

      expect(activityPlaceRepository.find).toHaveBeenCalledWith({
        where: { deletedAt: expect.anything() as unknown },
        relations: { place: true },
      });
      expect(externalSyncRepository.update).toHaveBeenNthCalledWith(
        1,
        7,
        expect.objectContaining({ recordCount: 0 }),
      );
      expect(externalSyncRepository.update).toHaveBeenNthCalledWith(
        2,
        7,
        expect.objectContaining({
          status: EXTERNAL_SYNC_STATUS.COMPLETED,
          endedAt: expect.any(Date) as Date,
        }),
      );
    });

    it('first-links an unlinked row via searchPlace using the loaded place address (CU50)', async () => {
      const row = activityPlace({ googlePlaceId: null });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.searchPlace.mockResolvedValue({
        placeId: 'ChIJ-new',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
      });

      await service.run(7);

      expect(googleMaps.searchPlace).toHaveBeenCalledWith('BUTE, Mendoza');
      expect(googleMaps.getPlaceDetails).not.toHaveBeenCalled();
      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          googlePlaceId: 'ChIJ-new',
          latitude: -32.89,
          longitude: -68.84,
        }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
    });

    it('re-verifies an already-linked row via getPlaceDetails, not searchPlace (CU50)', async () => {
      const row = activityPlace({ googlePlaceId: 'ChIJ-existing' });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJ-existing',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.9,
        longitude: -68.85,
      });

      await service.run(7);

      expect(googleMaps.getPlaceDetails).toHaveBeenCalledWith('ChIJ-existing');
      expect(googleMaps.searchPlace).not.toHaveBeenCalled();
      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: -32.9, longitude: -68.85 }),
      );
    });

    it('applies the missing-at-source strategy on a not_found result (CU50)', async () => {
      const row = activityPlace({
        googlePlaceId: 'ChIJ-gone',
        latitude: -32.89,
        longitude: -68.84,
      });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockRejectedValue(
        new GoogleMapsProviderError('gone', 'not_found'),
      );

      await service.run(7);

      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: null, longitude: null }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('counts multiple rows and ends COMPLETED when all succeed (CU50)', async () => {
      const rowA = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      const rowB = activityPlace({ id: 2, googlePlaceId: null });
      activityPlaceRepository.find.mockResolvedValue([rowA, rowB]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJ-a',
        name: 'A',
        address: 'A',
        latitude: 1,
        longitude: 1,
      });
      googleMaps.searchPlace.mockResolvedValue({
        placeId: 'ChIJ-b',
        name: 'B',
        address: 'B',
        latitude: 2,
        longitude: 2,
      });

      await service.run(7);

      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 2 }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('continues past a permanent provider_error, counts other rows, and throws PermanentJobError once after the loop (CU50)', async () => {
      const rowA = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      const rowB = activityPlace({ id: 2, googlePlaceId: 'ChIJ-b' });
      activityPlaceRepository.find.mockResolvedValue([rowA, rowB]);
      googleMaps.getPlaceDetails.mockImplementation((placeId: string) => {
        if (placeId === 'ChIJ-a') {
          return Promise.reject(
            new GoogleMapsProviderError('bad', 'provider_error'),
          );
        }
        return Promise.resolve({
          placeId: 'ChIJ-b',
          name: 'B',
          address: 'B',
          latitude: 2,
          longitude: 2,
        });
      });

      await expect(service.run(7)).rejects.toBeInstanceOf(PermanentJobError);

      expect(activityPlaceRepository.save).toHaveBeenCalledTimes(1);
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
      expect(externalSyncRepository.update).not.toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('continues past transient errors, persists recordCount, keeps RUNNING, and throws RetryableJobError once after the loop (CU50)', async () => {
      const rowA = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      const rowB = activityPlace({ id: 2, googlePlaceId: 'ChIJ-b' });
      activityPlaceRepository.find.mockResolvedValue([rowA, rowB]);
      googleMaps.getPlaceDetails.mockImplementation((placeId: string) => {
        if (placeId === 'ChIJ-a') {
          return Promise.reject(
            new GoogleMapsProviderError('busy', 'rate_limited'),
          );
        }
        return Promise.resolve({
          placeId: 'ChIJ-b',
          name: 'B',
          address: 'B',
          latitude: 2,
          longitude: 2,
        });
      });

      await expect(service.run(7)).rejects.toBeInstanceOf(RetryableJobError);

      expect(activityPlaceRepository.save).toHaveBeenCalledTimes(1);
      expect(externalSyncRepository.update).toHaveBeenCalledTimes(1);
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
      expect(externalSyncRepository.update).not.toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('prefers PermanentJobError over RetryableJobError when both occur in the same run (CU50)', async () => {
      const rowA = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      const rowB = activityPlace({ id: 2, googlePlaceId: 'ChIJ-b' });
      activityPlaceRepository.find.mockResolvedValue([rowA, rowB]);
      googleMaps.getPlaceDetails.mockImplementation((placeId: string) => {
        if (placeId === 'ChIJ-a') {
          return Promise.reject(
            new GoogleMapsProviderError('busy', 'rate_limited'),
          );
        }
        return Promise.reject(
          new GoogleMapsProviderError('bad', 'provider_error'),
        );
      });

      await expect(service.run(7)).rejects.toBeInstanceOf(PermanentJobError);
    });

    it('sets recordCount rather than incrementing it on a retried run (CU50)', async () => {
      const row = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJ-a',
        name: 'A',
        address: 'A',
        latitude: 1,
        longitude: 1,
      });

      await service.run(7);
      await service.run(7);

      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
      expect(externalSyncRepository.update).not.toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 2 }),
      );
    });
  });

  describe('markFailed', () => {
    it('marks the run as failed with the error message (CU49)', async () => {
      await service.markFailed(7, new Error('boom'));

      expect(externalSyncRepository.update).toHaveBeenCalledWith(
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

      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ errorMessage: 'raw failure' }),
      );
    });
  });
});
