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

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 1,
    name: 'BUTE',
    address: 'Av. San Martín 1000',
    department: { name: 'Ciudad de Mendoza' },
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    externalLatitude: null,
    externalLongitude: null,
    externalRating: null,
    externalRatingCount: null,
    externalPriceMin: null,
    externalPriceMax: null,
    externalPriceCurrency: null,
    externalPriceLevel: null,
    externalBusinessStatus: null,
    externalFetchedAt: null,
    externalExpiresAt: null,
    ...overrides,
  } as Place;
}

function link(overrides: Partial<ActivityPlace> = {}): ActivityPlace {
  return {
    id: 1,
    idActivity: 1,
    idPlace: 1,
    latitude: null,
    longitude: null,
    notes: null,
    coordinatesSource: null,
    externalFetchedAt: null,
    externalExpiresAt: null,
    deletedAt: null,
    ...overrides,
  } as ActivityPlace;
}

const resolved = {
  placeId: 'ChIJ-new',
  name: 'BUTE',
  address: 'Mendoza, Argentina',
  latitude: -32.89,
  longitude: -68.84,
};

describe('ExternalSyncService', () => {
  let service: ExternalSyncService;
  let externalSyncRepository: jest.Mocked<
    Pick<Repository<ExternalSync>, 'update'>
  >;
  let placeRepository: jest.Mocked<
    Pick<Repository<Place>, 'find' | 'save' | 'count'>
  >;
  let activityPlaceRepository: jest.Mocked<
    Pick<Repository<ActivityPlace>, 'find' | 'save'>
  >;
  let googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'searchPlace' | 'getPlaceDetails'>
  >;
  let externalDataUsage: jest.Mocked<
    Pick<ExternalDataUsageService, 'record' | 'countSince'>
  >;
  let links: ActivityPlace[];

  beforeEach(async () => {
    links = [];
    externalSyncRepository = { update: jest.fn() };
    placeRepository = { find: jest.fn(), save: jest.fn(), count: jest.fn() };
    activityPlaceRepository = { find: jest.fn(), save: jest.fn() };
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
        { provide: getRepositoryToken(Place), useValue: placeRepository },
        {
          provide: getRepositoryToken(ActivityPlace),
          useValue: activityPlaceRepository,
        },
        { provide: GoogleMapsClientService, useValue: googleMaps },
        { provide: ExternalDataUsageService, useValue: externalDataUsage },
      ],
    }).compile();

    service = module.get(ExternalSyncService);
    placeRepository.save.mockImplementation((row) =>
      Promise.resolve(row as Place),
    );
    activityPlaceRepository.find.mockImplementation(() =>
      Promise.resolve(links),
    );
    activityPlaceRepository.save.mockImplementation((row) =>
      Promise.resolve(row as ActivityPlace),
    );
  });

  describe('run', () => {
    it('completes with recordCount 0 when there are no places (CU50)', async () => {
      placeRepository.find.mockResolvedValue([]);

      await service.run(7);

      expect(placeRepository.find).toHaveBeenCalledWith({
        where: { deletedAt: expect.anything() as unknown },
        relations: { department: true },
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

    it('first-links an unlinked place via searchPlace using its name, address and department (CU50)', async () => {
      placeRepository.find.mockResolvedValue([place()]);
      googleMaps.searchPlace.mockResolvedValue(resolved);

      await service.run(7);

      expect(googleMaps.searchPlace).toHaveBeenCalledWith(
        'BUTE, Av. San Martín 1000, Ciudad de Mendoza',
      );
      expect(googleMaps.getPlaceDetails).not.toHaveBeenCalled();
      expect(placeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          googlePlaceId: 'ChIJ-new',
          externalLatitude: -32.89,
          externalLongitude: -68.84,
        }),
      );
      expect(externalDataUsage.record).toHaveBeenCalledWith(
        GOOGLE_MAPS_PROVIDER_KEY,
        'ChIJ-new',
        'external-sync-search',
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
    });

    it('re-verifies an already-linked place via getPlaceDetails, not searchPlace (CU50)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-existing' }),
      ]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        ...resolved,
        placeId: 'ChIJ-existing',
      });

      await service.run(7);

      expect(googleMaps.getPlaceDetails).toHaveBeenCalledWith('ChIJ-existing');
      expect(googleMaps.searchPlace).not.toHaveBeenCalled();
      expect(externalDataUsage.record).toHaveBeenCalledWith(
        GOOGLE_MAPS_PROVIDER_KEY,
        'ChIJ-existing',
        'external-sync',
      );
    });

    it('persists rating, place-level price and business status (CU52)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-existing' }),
      ]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        ...resolved,
        rating: 4.6,
        ratingCount: 812,
        priceRange: { min: 15000, max: 25000, currency: 'ARS' },
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
      });

      await service.run(7);

      expect(googleMaps.getPlaceDetails).toHaveBeenCalledTimes(1);
      expect(placeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalRating: 4.6,
          externalRatingCount: 812,
          externalPriceMin: 15000,
          externalPriceMax: 25000,
          externalPriceCurrency: 'ARS',
          externalPriceLevel: 'PRICE_LEVEL_MODERATE',
          externalBusinessStatus: 'OPERATIONAL',
        }),
      );
    });

    it('nulls both external rating fields when Google returns an incomplete pair (CU52)', async () => {
      placeRepository.find.mockResolvedValue([
        place({
          googlePlaceId: 'ChIJ-existing',
          externalRating: 4,
          externalRatingCount: 10,
        }),
      ]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        ...resolved,
        rating: 4.1,
      });

      await service.run(7);

      expect(placeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalRating: null,
          externalRatingCount: null,
        }),
      );
    });

    it('copies the cached coordinates to the links of a place SmartPlan has not located', async () => {
      links = [link()];
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-existing' }),
      ]);
      googleMaps.getPlaceDetails.mockResolvedValue(resolved);

      await service.run(7);

      expect(links[0]).toMatchObject({
        latitude: -32.89,
        longitude: -68.84,
        coordinatesSource: 'GOOGLE_CACHE',
      });
      expect(links[0].externalExpiresAt).toBeInstanceOf(Date);
    });

    it('never overwrites or nulls SmartPlan-owned coordinates (provider terms)', async () => {
      const owned = place({
        googlePlaceId: 'ChIJ-existing',
        latitude: -32.89,
        longitude: -68.84,
      });
      links = [
        link({
          latitude: -32.89,
          longitude: -68.84,
          coordinatesSource: 'OWNED',
        }),
      ];
      placeRepository.find.mockResolvedValue([owned]);
      googleMaps.getPlaceDetails.mockResolvedValue({
        ...resolved,
        latitude: -10,
        longitude: -10,
        rating: 4.2,
        ratingCount: 5,
      });

      await service.run(7);

      expect(owned.latitude).toBe(-32.89);
      expect(owned.longitude).toBe(-68.84);
      expect(owned.externalRating).toBe(4.2);
      expect(links[0]).toMatchObject({
        latitude: -32.89,
        coordinatesSource: 'OWNED',
      });

      googleMaps.getPlaceDetails.mockRejectedValue(
        new GoogleMapsProviderError('gone', 'not_found'),
      );
      await service.run(8);
      expect(owned.latitude).toBe(-32.89);
      expect(links[0].coordinatesSource).toBe('OWNED');
    });

    it('applies the missing-at-source strategy on a not_found result (CU50)', async () => {
      const gone = place({
        googlePlaceId: 'ChIJ-gone',
        externalLatitude: -32.8,
        externalLongitude: -68.8,
        externalRating: 4,
        externalRatingCount: 3,
      });
      placeRepository.find.mockResolvedValue([gone]);
      googleMaps.getPlaceDetails.mockRejectedValue(
        new GoogleMapsProviderError('gone', 'not_found'),
      );

      await service.run(7);

      expect(gone).toMatchObject({
        googlePlaceId: 'ChIJ-gone',
        externalLatitude: null,
        externalRating: null,
        externalExpiresAt: null,
      });
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('stamps Google content as a temporary cache that expires within 30 days', async () => {
      const row = place();
      placeRepository.find.mockResolvedValue([row]);
      googleMaps.searchPlace.mockResolvedValue(resolved);

      await service.run(7);

      expect(row.googlePlaceId).toBe('ChIJ-new');
      const ttlDays =
        (row.externalExpiresAt!.getTime() - row.externalFetchedAt!.getTime()) /
        (24 * 3600 * 1000);
      expect(ttlDays).toBeGreaterThan(0);
      expect(ttlDays).toBeLessThanOrEqual(30);
    });

    it('stops without calling Google when the monthly budget is spent', async () => {
      externalDataUsage.countSince.mockResolvedValue(100_000);
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-existing' }),
        place({ id: 2 }),
      ]);

      await service.run(7);

      expect(googleMaps.getPlaceDetails).not.toHaveBeenCalled();
      expect(googleMaps.searchPlace).not.toHaveBeenCalled();
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 0 }),
      );
    });

    it('stops quietly when the Google kill switch is on', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-a' }),
        place({ id: 2, googlePlaceId: 'ChIJ-b' }),
      ]);
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

    it('counts multiple places and ends COMPLETED when all succeed (CU50)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-a' }),
        place({ id: 2, googlePlaceId: 'ChIJ-b' }),
        place({ id: 3 }),
      ]);
      googleMaps.getPlaceDetails.mockResolvedValue(resolved);
      googleMaps.searchPlace.mockResolvedValue(resolved);

      await service.run(7);

      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 3 }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('continues past a permanent provider_error and throws PermanentJobError once after the loop (CU50)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-bad' }),
        place({ id: 2, googlePlaceId: 'ChIJ-good' }),
      ]);
      googleMaps.getPlaceDetails
        .mockRejectedValueOnce(
          new GoogleMapsProviderError('x', 'provider_error'),
        )
        .mockResolvedValueOnce(resolved);

      await expect(service.run(7)).rejects.toBeInstanceOf(PermanentJobError);

      expect(placeRepository.save).toHaveBeenCalledTimes(1);
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
      expect(externalSyncRepository.update).not.toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('continues past an unavailable provider, persists recordCount and throws RetryableJobError (CU50)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-down' }),
        place({ id: 2, googlePlaceId: 'ChIJ-good' }),
      ]);
      googleMaps.getPlaceDetails
        .mockRejectedValueOnce(new GoogleMapsProviderError('x', 'unavailable'))
        .mockResolvedValueOnce(resolved);

      await expect(service.run(7)).rejects.toBeInstanceOf(RetryableJobError);

      expect(placeRepository.save).toHaveBeenCalledTimes(1);
      expect(externalSyncRepository.update).toHaveBeenCalledTimes(1);
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 1 }),
      );
    });

    it('prefers PermanentJobError over RetryableJobError when both occur in the same run (CU50)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-a' }),
        place({ id: 2, googlePlaceId: 'ChIJ-b' }),
      ]);
      googleMaps.getPlaceDetails
        .mockRejectedValueOnce(new GoogleMapsProviderError('x', 'unavailable'))
        .mockRejectedValueOnce(
          new GoogleMapsProviderError('y', 'provider_error'),
        );

      await expect(service.run(7)).rejects.toBeInstanceOf(PermanentJobError);
    });

    it('keeps existing data when the first-link search finds no match (CU50)', async () => {
      const row = place({ latitude: -32.89, longitude: -68.84 });
      placeRepository.find.mockResolvedValue([row]);
      googleMaps.searchPlace.mockRejectedValue(
        new GoogleMapsProviderError('none', 'not_found'),
      );

      await service.run(7);

      expect(placeRepository.save).not.toHaveBeenCalled();
      expect(row.latitude).toBe(-32.89);
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recordCount: 0 }),
      );
      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: EXTERNAL_SYNC_STATUS.COMPLETED }),
      );
    });

    it('stops the pass on a rate limit instead of calling Google for the remaining places (CU50)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-a' }),
        place({ id: 2, googlePlaceId: 'ChIJ-b' }),
      ]);
      googleMaps.getPlaceDetails.mockRejectedValue(
        new GoogleMapsProviderError('slow down', 'rate_limited'),
      );

      await expect(service.run(7)).rejects.toBeInstanceOf(RetryableJobError);

      expect(googleMaps.getPlaceDetails).toHaveBeenCalledTimes(1);
      expect(placeRepository.save).not.toHaveBeenCalled();
    });

    it('completes the run even when recording external data usage fails (CU51)', async () => {
      placeRepository.find.mockResolvedValue([
        place({ googlePlaceId: 'ChIJ-a' }),
      ]);
      googleMaps.getPlaceDetails.mockResolvedValue(resolved);
      externalDataUsage.record.mockRejectedValue(new Error('db down'));

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
    it('drops expired Google cache from places and links, keeps owned coordinates and the place id', async () => {
      const cached = place({
        googlePlaceId: 'ChIJ-cached',
        latitude: -33,
        longitude: -68,
        externalLatitude: -32.9,
        externalLongitude: -68.8,
        externalRating: 4.4,
        externalRatingCount: 9,
        externalExpiresAt: new Date('2020-01-01T00:00:00Z'),
      });
      const cachedLink = link({
        latitude: -32.9,
        longitude: -68.8,
        coordinatesSource: 'GOOGLE_CACHE',
        externalExpiresAt: new Date('2020-01-01T00:00:00Z'),
      });
      placeRepository.find.mockResolvedValue([cached]);
      activityPlaceRepository.find.mockResolvedValue([cachedLink]);

      await expect(service.purgeExpiredCache(new Date())).resolves.toBe(2);

      expect(cached).toMatchObject({
        googlePlaceId: 'ChIJ-cached',
        latitude: -33,
        longitude: -68,
        externalLatitude: null,
        externalRating: null,
        externalExpiresAt: null,
      });
      expect(cachedLink).toMatchObject({
        latitude: null,
        coordinatesSource: null,
        externalExpiresAt: null,
      });
    });
  });

  describe('estimatePass', () => {
    it('estimates the cost of a pass without calling Google', async () => {
      placeRepository.count
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(20);

      const estimate = await service.estimatePass();

      expect(estimate).toMatchObject({ textSearches: 20, placeDetails: 100 });
      expect(estimate.costUsd).toBeCloseTo(20 * 0.04 + 100 * 0.025, 3);
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
        }),
      );
    });

    it('stringifies a non-Error value as the error message (CU49)', async () => {
      await service.markFailed(7, 'plain');

      expect(externalSyncRepository.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ errorMessage: 'plain' }),
      );
    });
  });
});
