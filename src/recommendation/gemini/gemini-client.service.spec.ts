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

describe('GeminiClientService', () => {
  let service: GeminiClientService;

  const input: GenerateGeminiPlanDto = {
    budget: 40000,
    latitude: -32.8895,
    longitude: -68.8458,
    peopleCount: 2,
    availableDurationMinutes: 330,
    preferences: ['gastronomy', 'sightseeing', 'cafe'],
  };

  beforeEach(async () => {
    generateContentMock.mockReset();

    const configuration: Pick<ConfigService, 'get'> = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'key-of-test';
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

  describe('generatePlan', () => {
    it('combines grounding and structuring responses into a valid result', async () => {
      generateContentMock
        .mockResolvedValueOnce({
          text: 'I found Winery X and Cafe Y near the requested location.',
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
                    maps: {
                      title: 'Cafe Y',
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
            title: 'Wine and coffee afternoon in Mendoza',
            description: 'A visit to Winery X and Cafe Y.',
            estimatedTotalCost: 35000,
            estimatedTotalDurationMinutes: 300,
            activities: [
              {
                name: 'Visita a Bodega X',
                description: 'Wine tasting.',
                suggestedPlace: 'Bodega X',
                approximateAddress: null,
                estimatedCost: 25000,
                estimatedDurationMinutes: 180,
                order: 1,
              },
              {
                name: 'Coffee at Cafe Y',
                description: 'Sobremesa.',
                suggestedPlace: 'Cafe Y',
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

      const result = await service.generatePlan(input);

      expect(generateContentMock).toHaveBeenCalledTimes(2);
      expect(result.plan.title).toBe('Wine and coffee afternoon in Mendoza');
      expect(result.plan.activities).toHaveLength(2);
      expect(result.groundedPlaces).toEqual([
        {
          title: 'Bodega X',
          uri: 'https://maps.google.com/?cid=1',
          placeId: 'places/abc123',
        },
        {
          title: 'Cafe Y',
          uri: 'https://maps.google.com/?cid=2',
          placeId: null,
        },
      ]);
      expect(result.metrics.grounding.totalTokens).toBe(200);
      expect(result.metrics.structuring.totalTokens).toBe(450);
      expect(result.metrics.budgetRespected).toBe(true);
    });

    it('does not expose the raw SDK error when the Gemini call fails', async () => {
      generateContentMock.mockRejectedValueOnce(
        new Error('rate limit exceeded'),
      );

      await expect(service.generatePlan(input)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
