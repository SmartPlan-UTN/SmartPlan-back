import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GeminiClientService } from './gemini-client.service';
import { GenerateGeminiPlanDto } from './dto/generate-gemini-plan.dto';

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
 * (`test/gemini-spike.spike.spec.ts`) por envelope cobertura exhaustiva acá.
 */
describe('GeminiClientService', () => {
  let service: GeminiClientService;

  const input: GenerateGeminiPlanDto = {
    budget: 40000,
    latitude: -32.8895,
    longitude: -68.8458,
    peopleCount: 2,
    availableDurationMinutes: 330,
    preferences: ['gastronomía', 'paseo', 'café'],
  };

  beforeEach(async () => {
    generateContentMock.mockReset();

    const configuration: Pick<ConfigService, 'get'> = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'key-de-prueba';
        if (key === 'GEMINI_MODEL') return 'gemini-3.6-flash';
        return undefined;
      }) as ConfigService['get'],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClientService,
        { provide: ConfigService, useValue: configuration },
      ],
    }).compile();

    service = module.get(GeminiClientService);
  });

  describe('generarPlan', () => {
    it('combina la response de grounding y de estructuración en un result válido', async () => {
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
            title: 'Tarde de vino y café en Mendoza',
            description: 'Un paseo por Bodega X y Café Y.',
            estimatedTotalCost: 35000,
            estimatedTotalDurationMinutes: 300,
            activities: [
              {
                name: 'Visita a Bodega X',
                description: 'Degustación de vinos.',
                suggestedPlace: 'Bodega X',
                approximateAddress: null,
                estimatedCost: 25000,
                estimatedDurationMinutes: 180,
                order: 1,
              },
              {
                name: 'Café en Café Y',
                description: 'Sobremesa.',
                suggestedPlace: 'Café Y',
                approximateAddress: null,
                estimatedCost: 10000,
                estimatedDurationMinutes: 120,
                order: 2,
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

      const result = await service.generarPlan(input);

      expect(generateContentMock).toHaveBeenCalledTimes(2);
      expect(result.plan.title).toBe('Tarde de vino y café en Mendoza');
      expect(result.plan.activities).toHaveLength(2);
      expect(result.groundedPlaces).toEqual([
        {
          title: 'Bodega X',
          uri: 'https://maps.google.com/?cid=1',
          placeId: 'places/abc123',
        },
        {
          title: 'Café Y',
          uri: 'https://maps.google.com/?cid=2',
          placeId: null,
        },
      ]);
      expect(result.metrics.grounding.totalTokens).toBe(200);
      expect(result.metrics.structuring.totalTokens).toBe(450);
      expect(result.metrics.budgetRespected).toBe(true);
    });

    it('no expone el error crudo del SDK cuando la llamada a Gemini falla', async () => {
      generateContentMock.mockRejectedValueOnce(
        new Error('rate limit exceeded'),
      );

      await expect(service.generarPlan(input)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
