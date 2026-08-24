import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { PlacesLookupService } from './places-lookup.service';

describe('PlacesLookupService', () => {
  let service: PlacesLookupService;
  let googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'searchPlace' | 'geocode'>
  >;

  beforeEach(async () => {
    googleMaps = { searchPlace: jest.fn(), geocode: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlacesLookupService,
        { provide: GoogleMapsClientService, useValue: googleMaps },
      ],
    }).compile();

    service = module.get(PlacesLookupService);
  });

  describe('searchPlace', () => {
    const place = {
      placeId: 'ChIJ-BUTE',
      name: 'BUTE',
      address: 'Mendoza, Argentina',
      latitude: -32.89,
      longitude: -68.84,
    };

    it('returns the place resolved by Google Maps (CU48)', async () => {
      googleMaps.searchPlace.mockResolvedValue(place);

      await expect(service.searchPlace('BUTE')).resolves.toEqual(place);
    });

    it('caches equivalent queries and calls the provider only once (CU48)', async () => {
      googleMaps.searchPlace.mockResolvedValue(place);

      await service.searchPlace('BUTE');
      await service.searchPlace('bute');

      expect(googleMaps.searchPlace).toHaveBeenCalledTimes(1);
    });

    it('maps a not_found provider error to NotFoundException (CU48)', async () => {
      googleMaps.searchPlace.mockRejectedValue(
        new GoogleMapsProviderError('no results', 'not_found'),
      );

      await expect(service.searchPlace('nowhere')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps a rate_limited provider error to a 429 HttpException (CU48)', async () => {
      googleMaps.searchPlace.mockRejectedValue(
        new GoogleMapsProviderError('rate limited', 'rate_limited'),
      );

      await expect(service.searchPlace('BUTE')).rejects.toMatchObject({
        status: 429,
      });
    });

    it('maps an unavailable provider error to a 503 HttpException (CU48)', async () => {
      googleMaps.searchPlace.mockRejectedValue(
        new GoogleMapsProviderError('down', 'unavailable'),
      );

      await expect(service.searchPlace('BUTE')).rejects.toMatchObject({
        status: 503,
      });
    });

    it('maps a provider_error to a 502 HttpException (CU48)', async () => {
      googleMaps.searchPlace.mockRejectedValue(
        new GoogleMapsProviderError('boom', 'provider_error'),
      );

      const rejection = service.searchPlace('BUTE');
      await expect(rejection).rejects.toBeInstanceOf(HttpException);
      await expect(rejection).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('geocode', () => {
    it('returns coordinates resolved by Google Maps (CU48)', async () => {
      googleMaps.geocode.mockResolvedValue({
        latitude: -32.89,
        longitude: -68.84,
      });

      await expect(service.geocode('Mendoza, Argentina')).resolves.toEqual({
        latitude: -32.89,
        longitude: -68.84,
      });
    });

    it('caches equivalent addresses and calls the provider only once (CU48)', async () => {
      googleMaps.geocode.mockResolvedValue({
        latitude: -32.89,
        longitude: -68.84,
      });

      await service.geocode('Mendoza, Argentina');
      await service.geocode('mendoza, argentina');

      expect(googleMaps.geocode).toHaveBeenCalledTimes(1);
    });

    it('maps a not_found provider error to NotFoundException (CU48)', async () => {
      googleMaps.geocode.mockRejectedValue(
        new GoogleMapsProviderError('no results', 'not_found'),
      );

      await expect(service.geocode('nowhere')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
