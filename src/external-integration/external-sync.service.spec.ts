import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Place } from '../places/entities/place.entity';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalDataUsageService } from './external-data-usage.service';
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
    externalRating: null,
    externalRatingCount: null,
    coordinatesSource: null,
    externalFetchedAt: null,
    externalExpiresAt: null,
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
    Pick<Repository<ActivityPlace>, 'find' | 'save' | 'count'>
  >;
  let googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'searchPlace' | 'getPlaceDetails'>
  >;
  let externalDataUsage: jest.Mocked<
    Pick<ExternalDataUsageService, 'record' | 'countSince'>
  >;

  beforeEach(async () => {
    externalSyncRepository = { update: jest.fn() };
    activityPlaceRepository = {
      find: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    };
    googleMaps = { searchPlace: jest.fn(), getPlaceDetails: jest.fn() };
    externalDataUsage = {
      record: jest.fn().mockResolvedValue(undefined),
      countSince: jest.fn().mockResolvedValue(0),
    };

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
        { provide: ExternalDataUsageService, useValue: externalDataUsage },
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
        order: { id: 'ASC' },
        skip: 0,
        take: expect.any(Number) as number,
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

    it('persists externalRating and externalRatingCount on first link (CU52)', async () => {
      const row = activityPlace({ googlePlaceId: null });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.searchPlace.mockResolvedValue({
        placeId: 'ChIJ-new',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
        rating: 4.6,
        ratingCount: 823,
      });

      await service.run(7);

      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalRating: 4.6,
          externalRatingCount: 823,
        }),
      );
    });

    it('persists externalRating and externalRatingCount on re-verify, calling Google once (CU52)', async () => {
      const row = activityPlace({ googlePlaceId: 'ChIJ-existing' });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJ-existing',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.9,
        longitude: -68.85,
        rating: 4.2,
        ratingCount: 100,
      });

      await service.run(7);

      expect(googleMaps.getPlaceDetails).toHaveBeenCalledTimes(1);
      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalRating: 4.2,
          externalRatingCount: 100,
        }),
      );
    });

    it('nulls externalRating and externalRatingCount when Google reports no rating (CU52)', async () => {
      const row = activityPlace({
        googlePlaceId: 'ChIJ-existing',
        externalRating: 4.2,
        externalRatingCount: 100,
      });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJ-existing',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.9,
        longitude: -68.85,
      });

      await service.run(7);

      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalRating: null,
          externalRatingCount: null,
        }),
      );
    });

    it('nulls both external rating fields when Google returns an incomplete pair (CU52)', async () => {
      const row = activityPlace({
        googlePlaceId: 'ChIJ-existing',
        externalRating: 4.2,
        externalRatingCount: 100,
      });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJ-existing',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.9,
        longitude: -68.85,
        ratingCount: 0,
      });

      await service.run(7);

      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalRating: null,
          externalRatingCount: null,
        }),
      );
    });

    it('applies the missing-at-source strategy on a not_found result (CU50)', async () => {
      const row = activityPlace({
        googlePlaceId: 'ChIJ-gone',
        latitude: -32.89,
        longitude: -68.84,
        coordinatesSource: 'GOOGLE_CACHE',
        externalRating: 4.5,
        externalRatingCount: 50,
      });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockRejectedValue(
        new GoogleMapsProviderError('gone', 'not_found'),
      );

      await service.run(7);

      expect(activityPlaceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: null,
          longitude: null,
          coordinatesSource: null,
          externalRating: null,
          externalRatingCount: null,
        }),
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

    it('never overwrites or nulls SmartPlan-owned coordinates (provider terms)', async () => {
      const owned = activityPlace({
        googlePlaceId: 'ChIJ-owned',
        latitude: -32.89,
        longitude: -68.84,
        coordinatesSource: 'OWNED',
      });
      activityPlaceRepository.find.mockResolvedValue([owned]);
      googleMaps.getPlaceDetails.mockResolvedValueOnce({
        placeId: 'ChIJ-owned',
        name: 'Somewhere',
        address: 'Elsewhere',
        latitude: -33.5,
        longitude: -69.5,
        rating: 4.2,
        ratingCount: 10,
      });

      await service.run(7);

      expect(owned.latitude).toBe(-32.89);
      expect(owned.longitude).toBe(-68.84);
      expect(owned.coordinatesSource).toBe('OWNED');
      // The rating is only a cache: it carries an expiry.
      expect(owned.externalRating).toBe(4.2);
      expect(owned.externalExpiresAt).toBeInstanceOf(Date);

      const gone = activityPlace({
        googlePlaceId: 'ChIJ-gone',
        latitude: -32.89,
        longitude: -68.84,
        coordinatesSource: 'OWNED',
      });
      activityPlaceRepository.find.mockResolvedValue([gone]);
      googleMaps.getPlaceDetails.mockRejectedValueOnce(
        new GoogleMapsProviderError('gone', 'not_found'),
      );
      await service.run(8);
      expect(gone.latitude).toBe(-32.89);
      expect(gone.coordinatesSource).toBe('OWNED');
    });

    it('stamps Google coordinates as a temporary cache that expires within 30 days', async () => {
      const row = activityPlace({ googlePlaceId: null });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.searchPlace.mockResolvedValueOnce({
        placeId: 'ChIJ-new',
        name: 'Place',
        address: 'Addr',
        latitude: -32.9,
        longitude: -68.8,
      });

      await service.run(7);

      expect(row.coordinatesSource).toBe('GOOGLE_CACHE');
      expect(row.googlePlaceId).toBe('ChIJ-new');
      const ttlDays =
        ((row.externalExpiresAt as Date).getTime() -
          (row.externalFetchedAt as Date).getTime()) /
        86_400_000;
      expect(ttlDays).toBeGreaterThan(0);
      expect(ttlDays).toBeLessThanOrEqual(30);
    });

    it('stops without calling Google when the monthly budget is spent', async () => {
      externalDataUsage.countSince.mockResolvedValue(10_000);
      activityPlaceRepository.find.mockResolvedValue([
        activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' }),
      ]);

      await service.run(7);

      expect(googleMaps.getPlaceDetails).not.toHaveBeenCalled();
      expect(googleMaps.searchPlace).not.toHaveBeenCalled();
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('stops quietly when the Google kill switch is on', async () => {
      const rows = [
        activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' }),
        activityPlace({ id: 2, googlePlaceId: 'ChIJ-b' }),
      ];
      activityPlaceRepository.find.mockResolvedValue(rows);
      googleMaps.getPlaceDetails.mockRejectedValue(
        new GoogleMapsProviderError('off', 'disabled'),
      );

      await service.run(7);

      expect(googleMaps.getPlaceDetails).toHaveBeenCalledTimes(1);
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

    it('continues past an unavailable provider, persists recordCount, keeps RUNNING, and throws RetryableJobError once after the loop (CU50)', async () => {
      const rowA = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      const rowB = activityPlace({ id: 2, googlePlaceId: 'ChIJ-b' });
      activityPlaceRepository.find.mockResolvedValue([rowA, rowB]);
      googleMaps.getPlaceDetails.mockImplementation((placeId: string) => {
        if (placeId === 'ChIJ-a') {
          return Promise.reject(
            new GoogleMapsProviderError('down', 'unavailable'),
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
            new GoogleMapsProviderError('down', 'unavailable'),
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

    it('keeps existing coordinates when the first-link search finds no match (CU50)', async () => {
      const row = activityPlace({
        googlePlaceId: null,
        latitude: -32.89,
        longitude: -68.84,
        externalRating: 4.5,
        externalRatingCount: 50,
      });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.searchPlace.mockRejectedValue(
        new GoogleMapsProviderError('no match', 'not_found'),
      );

      await service.run(7);

      expect(activityPlaceRepository.save).not.toHaveBeenCalled();
      expect(row.latitude).toBe(-32.89);
      expect(row.longitude).toBe(-68.84);
      expect(row.externalRating).toBe(4.5);
      expect(row.externalRatingCount).toBe(50);
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 0 }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('stops the pass on a rate limit instead of calling Google for the remaining rows (CU50)', async () => {
      const rowA = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      const rowB = activityPlace({ id: 2, googlePlaceId: 'ChIJ-b' });
      activityPlaceRepository.find.mockResolvedValue([rowA, rowB]);
      googleMaps.getPlaceDetails.mockRejectedValue(
        new GoogleMapsProviderError('busy', 'rate_limited'),
      );

      await expect(service.run(7)).rejects.toBeInstanceOf(RetryableJobError);

      expect(googleMaps.getPlaceDetails).toHaveBeenCalledTimes(1);
      expect(activityPlaceRepository.save).not.toHaveBeenCalled();
    });

    it('skips a row whose place was soft-deleted without calling Google (CU50)', async () => {
      const row = activityPlace({ id: 1, googlePlaceId: 'ChIJ-a' });
      (row as { place: unknown }).place = null;
      activityPlaceRepository.find.mockResolvedValue([row]);

      await service.run(7);

      expect(googleMaps.getPlaceDetails).not.toHaveBeenCalled();
      expect(googleMaps.searchPlace).not.toHaveBeenCalled();
      expect(activityPlaceRepository.save).not.toHaveBeenCalled();
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('records external data usage for every resolved row (CU51)', async () => {
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

      expect(externalDataUsage.record).toHaveBeenCalledWith(
        GOOGLE_MAPS_PROVIDER_KEY,
        'ChIJ-existing',
        'external-sync',
      );
    });

    it('completes the run even when recording external data usage fails (CU51)', async () => {
      const row = activityPlace({ googlePlaceId: 'ChIJ-existing' });
      activityPlaceRepository.find.mockResolvedValue([row]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJ-existing',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.9,
        longitude: -68.85,
      });
      externalDataUsage.record.mockRejectedValue(new Error('audit down'));

      await service.run(7);

      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });
  });

  describe('purgeExpiredCache', () => {
    it('drops expired Google cache, keeps owned coordinates and the place id', async () => {
      const cached = activityPlace({
        id: 1,
        googlePlaceId: 'ChIJ-a',
        latitude: -32.89,
        longitude: -68.84,
        coordinatesSource: 'GOOGLE_CACHE',
        externalRating: 4.5,
        externalRatingCount: 3,
        externalExpiresAt: new Date('2020-01-01T00:00:00Z'),
      });
      const owned = activityPlace({
        id: 2,
        googlePlaceId: 'ChIJ-b',
        latitude: -32.5,
        longitude: -68.5,
        coordinatesSource: 'OWNED',
        externalRating: 4,
        externalRatingCount: 1,
        externalExpiresAt: new Date('2020-01-01T00:00:00Z'),
      });
      activityPlaceRepository.find.mockResolvedValue([cached, owned]);

      await expect(service.purgeExpiredCache(new Date())).resolves.toBe(2);

      expect(cached).toMatchObject({
        latitude: null,
        longitude: null,
        coordinatesSource: null,
        externalRating: null,
        googlePlaceId: 'ChIJ-a',
      });
      expect(owned).toMatchObject({
        latitude: -32.5,
        coordinatesSource: 'OWNED',
        externalRating: null,
        googlePlaceId: 'ChIJ-b',
      });
    });
  });

  describe('estimatePass', () => {
    it('estimates the cost of a pass without calling Google', async () => {
      activityPlaceRepository.count
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(20);

      const estimate = await service.estimatePass();

      expect(estimate).toMatchObject({
        textSearches: 20,
        placeDetails: 100,
        fitsBudget: true,
      });
      expect(estimate.costUsd).toBeCloseTo(20 * 0.035 + 100 * 0.025, 3);
      expect(googleMaps.searchPlace).not.toHaveBeenCalled();
      expect(googleMaps.getPlaceDetails).not.toHaveBeenCalled();
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
