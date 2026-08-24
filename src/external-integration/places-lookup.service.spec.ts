import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExternalDataUsageService } from './external-data-usage.service';
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
  let externalDataUsage: jest.Mocked<Pick<ExternalDataUsageService, 'record'>>;

  beforeEach(async () => {
    googleMaps = { searchPlace: jest.fn(), geocode: jest.fn() };
    externalDataUsage = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlacesLookupService,
        { provide: GoogleMapsClientService, useValue: googleMaps },
        { provide: ExternalDataUsageService, useValue: externalDataUsage },
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

    it('records external data usage on a cache miss (CU51)', async () => {
      googleMaps.searchPlace.mockResolvedValue(place);

      await service.searchPlace('BUTE');

      expect(externalDataUsage.record).toHaveBeenCalledWith(
        'google-maps',
        place.placeId,
        'places-search',
      );
    });

    it('does not record external data usage on a cache hit (CU51)', async () => {
      googleMaps.searchPlace.mockResolvedValue(place);

      await service.searchPlace('BUTE');
      await service.searchPlace('bute');

      expect(externalDataUsage.record).toHaveBeenCalledTimes(1);
    });

    it('does not record external data usage on a provider error (CU51)', async () => {
      googleMaps.searchPlace.mockRejectedValue(
        new GoogleMapsProviderError('no results', 'not_found'),
      );

      await expect(service.searchPlace('nowhere')).rejects.toThrow();

      expect(externalDataUsage.record).not.toHaveBeenCalled();
    });

    it('propagates the error and does not cache the result when recording usage fails (CU51)', async () => {
      googleMaps.searchPlace.mockResolvedValue(place);
      externalDataUsage.record.mockRejectedValueOnce(new Error('db down'));

      await expect(service.searchPlace('BUTE')).rejects.toThrow('db down');

      externalDataUsage.record.mockResolvedValue(undefined);
      await service.searchPlace('BUTE');

      expect(googleMaps.searchPlace).toHaveBeenCalledTimes(2);
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

    it('records external data usage on a cache miss (CU51)', async () => {
      googleMaps.geocode.mockResolvedValue({
        latitude: -32.89,
        longitude: -68.84,
      });

      await service.geocode('Mendoza, Argentina');

      expect(externalDataUsage.record).toHaveBeenCalledWith(
        'google-maps',
        '-32.89,-68.84',
        'geocode',
      );
    });
  });
});
