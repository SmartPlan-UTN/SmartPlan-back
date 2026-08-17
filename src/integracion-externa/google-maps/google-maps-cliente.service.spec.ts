import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleMapsClienteService } from './google-maps-cliente.service';

function respuestaJson(cuerpo: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(cuerpo),
  } as Response;
}

describe('GoogleMapsClienteService', () => {
  let servicio: GoogleMapsClienteService;
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    const configuracion: jest.Mocked<Pick<ConfigService, 'get'>> = {
      get: jest.fn().mockReturnValue('clave-de-prueba'),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleMapsClienteService,
        { provide: ConfigService, useValue: configuracion },
      ],
    }).compile();

    servicio = modulo.get(GoogleMapsClienteService);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('buscarLugar', () => {
    it('devuelve el primer lugar encontrado por Places Text Search', async () => {
      fetchMock.mockResolvedValue(
        respuestaJson({
          places: [
            {
              id: 'ChIJ-bute-1234',
              displayName: { text: 'BUTE' },
              formattedAddress: 'Mendoza, Argentina',
              location: { latitude: -32.89, longitude: -68.84 },
            },
          ],
        }),
      );

      const lugar = await servicio.buscarLugar('BUTE, Mendoza');

      expect(lugar).toEqual({
        placeId: 'ChIJ-bute-1234',
        nombre: 'BUTE',
        direccion: 'Mendoza, Argentina',
        latitud: -32.89,
        longitud: -68.84,
      });
    });

    it('lanza cuando Places no encuentra resultados (CU48)', async () => {
      fetchMock.mockResolvedValue(respuestaJson({ places: [] }));

      await expect(servicio.buscarLugar('lugar inexistente')).rejects.toThrow(
        'Google Places no encontró resultados',
      );
    });
  });

  describe('calcularDistancia', () => {
    it('devuelve distancia y duración de Compute Route Matrix', async () => {
      fetchMock.mockResolvedValue(
        respuestaJson([
          {
            originIndex: 0,
            destinationIndex: 0,
            duration: '930s',
            distanceMeters: 4200,
            condition: 'ROUTE_EXISTS',
          },
        ]),
      );

      const distancia = await servicio.calcularDistancia(
        'ChIJ-origen',
        'ChIJ-destino',
      );

      expect(distancia).toEqual({
        distanciaMetros: 4200,
        duracionSegundos: 930,
      });
    });

    it('lanza cuando Routes no encuentra una ruta válida (CU48)', async () => {
      fetchMock.mockResolvedValue(
        respuestaJson([{ condition: 'ROUTE_NOT_FOUND' }]),
      );

      await expect(
        servicio.calcularDistancia('ChIJ-origen', 'ChIJ-destino'),
      ).rejects.toThrow('no devolvió una ruta válida');
    });
  });

  describe('geocodificar', () => {
    it('devuelve coordenadas para una dirección en texto libre', async () => {
      fetchMock.mockResolvedValue(
        respuestaJson({
          status: 'OK',
          results: [{ geometry: { location: { lat: -32.89, lng: -68.84 } } }],
        }),
      );

      const coordenadas = await servicio.geocodificar('Mendoza, Argentina');

      expect(coordenadas).toEqual({ latitud: -32.89, longitud: -68.84 });
    });
  });
});
