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

    it('throws an unavailable error for a provider 5xx response (CU50)', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 500));

      await expect(
        service.getPlaceDetails('ChIJ-details'),
      ).rejects.toMatchObject({
        reason: 'unavailable',
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

  describe('calculateRoute', () => {
    const origin = { latitude: -32.89, longitude: -68.84 };
    const stop = { latitude: -32.9, longitude: -68.85 };
    const destination = { latitude: -32.91, longitude: -68.86 };

    it('returns the total distance and duration of an ordered itinerary', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          routes: [{ duration: '1200s', distanceMeters: 8000 }],
        }),
      );

      const route = await service.calculateRoute([origin, stop, destination]);

      expect(route).toEqual({ distanceMeters: 8000, durationSeconds: 1200 });
    });

    it('sends intermediates in order using computeRoutes, not computeRouteMatrix', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          routes: [{ duration: '1200s', distanceMeters: 8000 }],
        }),
      );

      await service.calculateRoute([origin, stop, destination]);

      const [url, options] = fetchMock.mock.calls[0] as [
        string,
        { body: string },
      ];
      expect(url).toContain('computeRoutes');
      const body = JSON.parse(options.body) as {
        origin: { location: { latLng: { latitude: number } } };
        intermediates: { location: { latLng: { latitude: number } } }[];
        destination: { location: { latLng: { latitude: number } } };
      };
      expect(body.origin.location.latLng.latitude).toBe(origin.latitude);
      expect(body.intermediates).toHaveLength(1);
      expect(body.intermediates[0].location.latLng.latitude).toBe(
        stop.latitude,
      );
      expect(body.destination.location.latLng.latitude).toBe(
        destination.latitude,
      );
    });

    it('throws when fewer than two waypoints are given', async () => {
      await expect(service.calculateRoute([origin])).rejects.toThrow(
        'requires at least an origin and a destination',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when Google Routes returns no valid itinerary', async () => {
      fetchMock.mockResolvedValue(responseJson({ routes: [] }));

      await expect(
        service.calculateRoute([origin, destination]),
      ).rejects.toThrow('did not return a valid itinerary');
    });

    it('classifies an HTTP 500 from Compute Routes as unavailable', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 500));

      await expect(
        service.calculateRoute([origin, destination]),
      ).rejects.toMatchObject({
        reason: 'unavailable',
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

    it('classifies an HTTP 503 as unavailable', async () => {
      fetchMock.mockResolvedValue(responseJson({}, false, 503));

      await expect(service.geocode('BUTE')).rejects.toMatchObject({
        reason: 'unavailable',
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

    it('keeps a denied geocoding request as a provider_error (CU48)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({ status: 'REQUEST_DENIED', results: [] }),
      );

      await expect(service.geocode('Mendoza')).rejects.toMatchObject({
        reason: 'provider_error',
      } as Partial<GoogleMapsProviderError>);
    });

    it('classifies an unknown geocoding server error as unavailable (CU48)', async () => {
      fetchMock.mockResolvedValue(
        responseJson({ status: 'UNKNOWN_ERROR', results: [] }),
      );

      await expect(service.geocode('Mendoza')).rejects.toMatchObject({
        reason: 'unavailable',
      } as Partial<GoogleMapsProviderError>);
    });
  });
});
