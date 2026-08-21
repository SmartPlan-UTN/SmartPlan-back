import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleMapsClientService } from './google-maps-client.service';

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
  });
});
