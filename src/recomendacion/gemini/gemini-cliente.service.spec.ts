import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GeminiClienteService } from './gemini-cliente.service';
import { GenerarPlanGeminiDto } from './dto/generar-plan-gemini.dto';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

/**
 * Unitario mínimo del spike (ticket #32): un camino feliz que ejercita las
 * dos llamadas encadenadas, y un camino de error. No cubre cada rama de
 * parseo — ver el plan del ticket: prioriza el test de integración real
 * (`test/gemini-spike.spike.spec.ts`) por sobre cobertura exhaustiva acá.
 */
describe('GeminiClienteService', () => {
  let servicio: GeminiClienteService;

  const entrada: GenerarPlanGeminiDto = {
    presupuesto: 40000,
    latitud: -32.8895,
    longitud: -68.8458,
    cantidadPersonas: 2,
    duracionDisponibleMinutos: 330,
    preferencias: ['gastronomía', 'paseo', 'café'],
  };

  beforeEach(async () => {
    generateContentMock.mockReset();

    const configuracion: jest.Mocked<Pick<ConfigService, 'get'>> = {
      get: jest.fn((clave: string) => {
        if (clave === 'GEMINI_API_KEY') return 'clave-de-prueba';
        if (clave === 'GEMINI_MODEL') return 'gemini-3.6-flash';
        return undefined;
      }),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClienteService,
        { provide: ConfigService, useValue: configuracion },
      ],
    }).compile();

    servicio = modulo.get(GeminiClienteService);
  });

  describe('generarPlan', () => {
    it('combina la respuesta de grounding y de estructuración en un resultado válido', async () => {
      generateContentMock
        .mockResolvedValueOnce({
          text: 'Encontré la Bodega X y el Café Y cerca de la ubicación indicada.',
          usageMetadata: {
            promptTokenCount: 120,
            candidatesTokenCount: 80,
            totalTokenCount: 200,
          },
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: [
                  {
                    maps: {
                      title: 'Bodega X',
                      uri: 'https://maps.google.com/?cid=1',
                      placeId: 'places/abc123',
                    },
                  },
                  {
                    // Chunk sin placeId: no debe sintetizarse ninguno.
                    maps: {
                      title: 'Café Y',
                      uri: 'https://maps.google.com/?cid=2',
                    },
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            titulo: 'Tarde de vino y café en Mendoza',
            descripcion: 'Un paseo por Bodega X y Café Y.',
            costoTotalEstimado: 35000,
            duracionTotalEstimadaMinutos: 300,
            actividades: [
              {
                nombre: 'Visita a Bodega X',
                descripcion: 'Degustación de vinos.',
                lugarSugerido: 'Bodega X',
                direccionAproximada: null,
                costoEstimado: 25000,
                duracionEstimadaMinutos: 180,
                orden: 1,
              },
              {
                nombre: 'Café en Café Y',
                descripcion: 'Sobremesa.',
                lugarSugerido: 'Café Y',
                direccionAproximada: null,
                costoEstimado: 10000,
                duracionEstimadaMinutos: 120,
                orden: 2,
              },
            ],
          }),
          usageMetadata: {
            promptTokenCount: 300,
            candidatesTokenCount: 150,
            totalTokenCount: 450,
          },
          candidates: [],
        });

      const resultado = await servicio.generarPlan(entrada);

      expect(generateContentMock).toHaveBeenCalledTimes(2);
      expect(resultado.plan.titulo).toBe('Tarde de vino y café en Mendoza');
      expect(resultado.plan.actividades).toHaveLength(2);
      expect(resultado.lugaresGroundeados).toEqual([
        {
          titulo: 'Bodega X',
          uri: 'https://maps.google.com/?cid=1',
          placeId: 'places/abc123',
        },
        {
          titulo: 'Café Y',
          uri: 'https://maps.google.com/?cid=2',
          placeId: null,
        },
      ]);
      expect(resultado.metricas.grounding.tokensTotal).toBe(200);
      expect(resultado.metricas.estructuracion.tokensTotal).toBe(450);
      expect(resultado.metricas.presupuestoRespetado).toBe(true);
    });

    it('no expone el error crudo del SDK cuando la llamada a Gemini falla', async () => {
      generateContentMock.mockRejectedValueOnce(
        new Error('rate limit exceeded'),
      );

      await expect(servicio.generarPlan(entrada)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
