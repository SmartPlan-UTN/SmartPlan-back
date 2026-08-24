import { Test, TestingModule } from '@nestjs/testing';
import { PlacesLookupController } from './places-lookup.controller';
import { PlacesLookupService } from './places-lookup.service';

describe('PlacesLookupController', () => {
  let controller: PlacesLookupController;
  let service: jest.Mocked<
    Pick<PlacesLookupService, 'searchPlace' | 'geocode'>
  >;

  beforeEach(async () => {
    service = { searchPlace: jest.fn(), geocode: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlacesLookupController],
      providers: [{ provide: PlacesLookupService, useValue: service }],
    }).compile();

    controller = module.get(PlacesLookupController);
  });

  describe('search', () => {
    it('delegates the query to the service and returns its result (CU48)', async () => {
      const place = {
        placeId: 'ChIJ-BUTE',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
      };
      service.searchPlace.mockResolvedValue(place);

      await expect(controller.search({ query: 'BUTE' })).resolves.toEqual(
        place,
      );
      expect(service.searchPlace).toHaveBeenCalledWith('BUTE');
    });
  });

  describe('geocode', () => {
    it('delegates the address to the service and returns its result (CU48)', async () => {
      service.geocode.mockResolvedValue({
        latitude: -32.89,
        longitude: -68.84,
      });

      await expect(
        controller.geocode({ address: 'Mendoza, Argentina' }),
      ).resolves.toEqual({ latitude: -32.89, longitude: -68.84 });
      expect(service.geocode).toHaveBeenCalledWith('Mendoza, Argentina');
    });
  });
});
