import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps-client.service';

function responseJson(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('GoogleMapsClientService', () => {
  let service: GoogleMapsClientService;
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    const configuration: jest.Mocked<Pick<ConfigService, 'get'>> = {
      get: jest.fn().mockReturnValue('key-of-test'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleMapsClientService,
        { provide: ConfigService, useValue: configuration },
      ],
    }).compile();

    service = module.get(GoogleMapsClientService);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('searchPlace', () => {
    it('returns the first place found by Places Text Search', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          places: [
            {
              id: 'ChIJ-routeResult-1234',
              displayName: { text: 'BUTE' },
              formattedAddress: 'Mendoza, Argentina',
              location: { latitude: -32.89, longitude: -68.84 },
            },
          ],
        }),
      );

      const place = await service.searchPlace('BUTE, Mendoza');

      expect(place).toEqual({
        placeId: 'ChIJ-routeResult-1234',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
      });
    });

    it('throws when Places finds no results (CU48)', async () => {
      fetchMock.mockResolvedValue(responseJson({ places: [] }));

      await expect(service.searchPlace('place nonexistent')).rejects.toThrow(
        'Google Places found no results',
      );
    });

    it('throws a rate_limited error when Places returns 429 (CU48)', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 429));

      await expect(service.searchPlace('BUTE')).rejects.toMatchObject({
        reason: 'rate_limited',
      } as Partial<GoogleMapsProviderError>);
    });

    it('keeps an HTTP 404 from Text Search as a provider_error', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 404));

      await expect(service.searchPlace('BUTE')).rejects.toMatchObject({
        reason: 'provider_error',
      } as Partial<GoogleMapsProviderError>);
    });

    it('throws an unavailable error when the request fails (CU48)', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(service.searchPlace('BUTE')).rejects.toMatchObject({
        reason: 'unavailable',
      } as Partial<GoogleMapsProviderError>);
    });

    it('maps rating and userRatingCount when Google reports them (CU52)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          places: [
            {
              id: 'ChIJ-routeResult-1234',
              displayName: { text: 'BUTE' },
              formattedAddress: 'Mendoza, Argentina',
              location: { latitude: -32.89, longitude: -68.84 },
              rating: 4.6,
              userRatingCount: 823,
            },
          ],
        }),
      );

      const place = await service.searchPlace('BUTE, Mendoza');

      expect(place.rating).toBe(4.6);
      expect(place.ratingCount).toBe(823);
    });

    it('leaves rating and ratingCount absent when Google omits them (CU52)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          places: [
            {
              id: 'ChIJ-routeResult-1234',
              displayName: { text: 'BUTE' },
              formattedAddress: 'Mendoza, Argentina',
              location: { latitude: -32.89, longitude: -68.84 },
            },
          ],
        }),
      );

      const place = await service.searchPlace('BUTE, Mendoza');

      expect(place.rating).toBeUndefined();
      expect(place.ratingCount).toBeUndefined();
    });
  });

  describe('getPlaceDetails', () => {
    it('returns the place resolved by Place Details', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          id: 'ChIJ-details-1234',
          displayName: { text: 'BUTE' },
          formattedAddress: 'Mendoza, Argentina',
          location: { latitude: -32.89, longitude: -68.84 },
        }),
      );

      const place = await service.getPlaceDetails('ChIJ-details-1234');

      expect(place).toEqual({
        placeId: 'ChIJ-details-1234',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
      });
    });

    it('throws a not_found error when Place Details returns 404 (CU50)', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 404));

      await expect(
        service.getPlaceDetails('ChIJ-missing'),
      ).rejects.toMatchObject({
        reason: 'not_found',
      } as Partial<GoogleMapsProviderError>);
    });

    it('throws a rate_limited error when Place Details returns 429 (CU50)', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 429));

      await expect(
        service.getPlaceDetails('ChIJ-details'),
      ).rejects.toMatchObject({
        reason: 'rate_limited',
      } as Partial<GoogleMapsProviderError>);
    });

    it('throws a provider_error for other non-2xx statuses (CU50)', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 500));

      await expect(
        service.getPlaceDetails('ChIJ-details'),
      ).rejects.toMatchObject({
        reason: 'provider_error',
      } as Partial<GoogleMapsProviderError>);
    });

    it('maps rating and userRatingCount when Google reports them (CU52)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          id: 'ChIJ-details-1234',
          displayName: { text: 'BUTE' },
          formattedAddress: 'Mendoza, Argentina',
          location: { latitude: -32.89, longitude: -68.84 },
          rating: 4.6,
          userRatingCount: 823,
        }),
      );

      const place = await service.getPlaceDetails('ChIJ-details-1234');

      expect(place.rating).toBe(4.6);
      expect(place.ratingCount).toBe(823);
    });

    it('leaves rating and ratingCount absent when Google omits them (CU52)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          id: 'ChIJ-details-1234',
          displayName: { text: 'BUTE' },
          formattedAddress: 'Mendoza, Argentina',
          location: { latitude: -32.89, longitude: -68.84 },
        }),
      );

      const place = await service.getPlaceDetails('ChIJ-details-1234');

      expect(place.rating).toBeUndefined();
      expect(place.ratingCount).toBeUndefined();
    });
  });

  describe('calculateDistance', () => {
    it('returns distance and duration of Compute Route Matrix', async () => {
      fetchMock.mockResolvedValue(
        responseJson([
          {
            originIndex: 0,
            destinationIndex: 0,
            duration: '930s',
            distanceMeters: 4200,
            condition: 'ROUTE_EXISTS',
          },
        ]),
      );

      const distance = await service.calculateDistance(
        'ChIJ-origin',
        'ChIJ-destination',
      );

      expect(distance).toEqual({
        distanceMeters: 4200,
        durationSeconds: 930,
      });
    });

    it('throws when Routes finds no valid route (CU48)', async () => {
      fetchMock.mockResolvedValue(
        responseJson([{ condition: 'ROUTE_NOT_FOUND' }]),
      );

      await expect(
        service.calculateDistance('ChIJ-origin', 'ChIJ-destination'),
      ).rejects.toThrow('did not return a valid route');
    });

    it('keeps an HTTP 404 from Route Matrix as a provider_error', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 404));

      await expect(
        service.calculateDistance('ChIJ-origin', 'ChIJ-destination'),
      ).rejects.toMatchObject({
        reason: 'provider_error',
      } as Partial<GoogleMapsProviderError>);
    });
  });

  describe('geocode', () => {
    it('returns coordinates for a free-text address', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          status: 'OK',
          results: [{ geometry: { location: { lat: -32.89, lng: -68.84 } } }],
        }),
      );

      const coordinates = await service.geocode('Mendoza, Argentina');

      expect(coordinates).toEqual({ latitude: -32.89, longitude: -68.84 });
    });

    it('keeps an HTTP 404 from Geocoding as a provider_error', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 404));

      await expect(service.geocode('BUTE')).rejects.toMatchObject({
        reason: 'provider_error',
      } as Partial<GoogleMapsProviderError>);
    });

    it('throws a rate_limited error when status is OVER_QUERY_LIMIT (CU48)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({ status: 'OVER_QUERY_LIMIT', results: [] }),
      );

      await expect(service.geocode('Mendoza')).rejects.toMatchObject({
        reason: 'rate_limited',
      } as Partial<GoogleMapsProviderError>);
    });

    it('throws a not_found error when no results are returned (CU48)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({ status: 'ZERO_RESULTS', results: [] }),
      );

      await expect(
        service.geocode('nonexistent address'),
      ).rejects.toMatchObject({
        reason: 'not_found',
      } as Partial<GoogleMapsProviderError>);
    });
  });
});
