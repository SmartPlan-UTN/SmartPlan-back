import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { ExternalDataUsageService } from './external-data-usage.service';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { PlaceRefreshService } from './place-refresh.service';

const NOW = new Date('2026-10-12T12:00:00Z');

function link(over: Partial<ActivityPlace> = {}): ActivityPlace {
  return {
    id: 1,
    googlePlaceId: 'ChIJ-refresh-000001',
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    externalRating: null,
    externalRatingCount: null,
    externalPriceMin: null,
    externalPriceMax: null,
    externalPriceCurrency: null,
    externalPriceLevel: null,
    externalFetchedAt: null,
    externalExpiresAt: null,
    ...over,
  } as ActivityPlace;
}

describe('PlaceRefreshService', () => {
  let repo: { save: jest.Mock };
  let google: { getPlaceDetails: jest.Mock };
  let usage: { countSince: jest.Mock; record: jest.Mock };
  let service: PlaceRefreshService;

  beforeEach(() => {
    repo = { save: jest.fn((row: unknown) => Promise.resolve(row)) };
    google = {
      getPlaceDetails: jest.fn().mockResolvedValue({
        placeId: 'ChIJ-refresh-000001',
        name: 'X',
        address: 'Y',
        latitude: -32.9,
        longitude: -68.8,
        rating: 4.5,
        ratingCount: 120,
        priceRange: { min: 20000, max: 30000, currency: 'ARS' },
      }),
    };
    usage = {
      countSince: jest.fn().mockResolvedValue(0),
      record: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'GOOGLE_CATALOG_MONTHLY_BUDGET_USD' ? 25 : undefined,
      ),
    } as unknown as ConfigService;
    service = new PlaceRefreshService(
      repo as unknown as Repository<ActivityPlace>,
      google as unknown as GoogleMapsClientService,
      usage as unknown as ExternalDataUsageService,
      config,
    );
  });

  it('refreshes a link whose temporary cache is missing and caches rating and price', async () => {
    const row = link();
    expect(await service.refreshStale([row], NOW)).toBe(1);
    expect(row).toMatchObject({
      latitude: -32.9,
      coordinatesSource: 'GOOGLE_CACHE',
      externalRating: 4.5,
      externalPriceMin: 20000,
      externalPriceMax: 30000,
      externalPriceCurrency: 'ARS',
    });
    expect(row.externalExpiresAt!.getTime()).toBeGreaterThan(NOW.getTime());
    expect(usage.record).toHaveBeenCalledWith(
      expect.any(String),
      'ChIJ-refresh-000001',
      'place-refresh',
    );
  });

  it('does not call Google while the cache is still valid', async () => {
    const row = link({ externalExpiresAt: new Date('2026-10-20T00:00:00Z') });
    expect(await service.refreshStale([row], NOW)).toBe(0);
    expect(google.getPlaceDetails).not.toHaveBeenCalled();
  });

  it('never overwrites SmartPlan-owned coordinates', async () => {
    const row = link({
      latitude: -33.1,
      longitude: -68.9,
      coordinatesSource: 'OWNED',
    });
    await service.refreshStale([row], NOW);
    expect(row.latitude).toBe(-33.1);
    expect(row.coordinatesSource).toBe('OWNED');
  });

  it('stops when the monthly budget is exhausted', async () => {
    usage.countSince.mockResolvedValue(10_000);
    expect(await service.refreshStale([link()], NOW)).toBe(0);
    expect(google.getPlaceDetails).not.toHaveBeenCalled();
  });

  it('does not retry the same place within the retry window, even after a failure', async () => {
    google.getPlaceDetails.mockRejectedValue(
      new GoogleMapsProviderError('down', 'unavailable'),
    );
    const row = link();
    await service.refreshStale([row], NOW);
    await service.refreshStale([row], new Date(NOW.getTime() + 60_000));
    expect(google.getPlaceDetails).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached data when Google is unavailable and never throws', async () => {
    google.getPlaceDetails.mockRejectedValue(
      new GoogleMapsProviderError('limit', 'rate_limited'),
    );
    const row = link({
      externalRating: 4.0,
      externalRatingCount: 10,
      externalExpiresAt: new Date('2026-09-01T00:00:00Z'),
    });
    await expect(service.refreshStale([row], NOW)).resolves.toBe(0);
    expect(row.externalRating).toBe(4.0);
  });

  it('drops the cached content when Google no longer has the place', async () => {
    google.getPlaceDetails.mockRejectedValue(
      new GoogleMapsProviderError('gone', 'not_found'),
    );
    const row = link({
      latitude: -32.9,
      longitude: -68.8,
      coordinatesSource: 'GOOGLE_CACHE',
      externalRating: 4.0,
      externalRatingCount: 10,
      externalExpiresAt: new Date('2026-09-01T00:00:00Z'),
    });
    await service.refreshStale([row], NOW);
    expect(row.latitude).toBeNull();
    expect(row.externalRating).toBeNull();
  });

  it('respects the kill switch', async () => {
    google.getPlaceDetails.mockRejectedValue(
      new GoogleMapsProviderError('off', 'disabled'),
    );
    await expect(
      service.refreshStale(
        [link(), link({ id: 2, googlePlaceId: 'ChIJ-second-00000002' })],
        NOW,
      ),
    ).resolves.toBe(0);
    expect(google.getPlaceDetails).toHaveBeenCalledTimes(1);
  });
});
