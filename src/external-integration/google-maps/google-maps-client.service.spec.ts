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
      get: jest.fn().mockReturnValue('key-de-prueba'),
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

  describe('buscarPlace', () => {
    it('devuelve el primer place encontrado por Places Text Search', async () => {
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

      const place = await service.buscarPlace('BUTE, Mendoza');

      expect(place).toEqual({
        placeId: 'ChIJ-routeResult-1234',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
      });
    });

    it('lanza cuando Places no encuentra resultados (CU48)', async () => {
      fetchMock.mockResolvedValue(responseJson({ places: [] }));

      await expect(service.buscarPlace('place inexistente')).rejects.toThrow(
        'Google Places no encontró resultados',
      );
    });
  });

  describe('calcularDistancia', () => {
    it('devuelve distancia y duración de Compute Route Matrix', async () => {
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

      const distancia = await service.calcularDistancia(
        'ChIJ-origen',
        'ChIJ-destination',
      );

      expect(distancia).toEqual({
        distanciaMetros: 4200,
        durationSegundos: 930,
      });
    });

    it('lanza cuando Routes no encuentra una route válida (CU48)', async () => {
      fetchMock.mockResolvedValue(
        responseJson([{ condition: 'ROUTE_NOT_FOUND' }]),
      );

      await expect(
        service.calcularDistancia('ChIJ-origen', 'ChIJ-destination'),
      ).rejects.toThrow('no devolvió una route válida');
    });
  });

  describe('geocodificar', () => {
    it('devuelve coordinates para una dirección en texto libre', async () => {
      fetchMock.mockResolvedValue(
        responseJson({
          status: 'OK',
          results: [{ geometry: { location: { lat: -32.89, lng: -68.84 } } }],
        }),
      );

      const coordinates = await service.geocodificar('Mendoza, Argentina');

      expect(coordinates).toEqual({ latitude: -32.89, longitude: -68.84 });
    });
  });
});
