import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RetryableJobError } from '../../messaging/errors/retryable-job-error';
import { GeminiClientService } from './gemini-client.service';
import { GenerateGeminiPlanDto } from './dto/generate-gemini-plan.dto';
import { InterpretIntentInput } from './dto/interpret-intent.dto';
import { ComposePlansInput } from './dto/compose-plans.dto';

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

  describe('interpretIntent (CU17)', () => {
    const baseInput: InterpretIntentInput = {
      rawQuery: 'quiero cenar algo tranquilo con mi pareja en Godoy Cruz',
      context: {},
      candidateDepartments: [
        { id: 1, name: 'Godoy Cruz' },
        { id: 2, name: 'Luján de Cuyo' },
      ],
      candidateCategories: [
        { id: 10, name: 'Gastronomy' },
        { id: 11, name: 'Nightlife' },
      ],
    };

    it('resolves budget, department, categories, party size, and duration from free text', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          budget: 30000,
          departmentName: 'Godoy Cruz',
          categoryNames: ['Gastronomy'],
          partySize: 2,
          availableDuration: 180,
        }),
      });

      const result = await service.interpretIntent(baseInput);

      expect(result).toEqual({
        budget: 30000,
        departmentName: 'Godoy Cruz',
        categoryNames: ['Gastronomy'],
        partySize: 2,
        availableDuration: 180,
      });
      expect(generateContentMock).toHaveBeenCalledTimes(1);
    });

    it('never uses grounding tools for intent interpretation', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          budget: null,
          departmentName: null,
          categoryNames: [],
          partySize: null,
          availableDuration: null,
        }),
      });

      await service.interpretIntent(baseInput);

      const [[call]] = generateContentMock.mock.calls as [
        [{ config?: { tools?: unknown } }],
      ];
      expect(call.config?.tools).toBeUndefined();
    });

    it('does not overwrite context chips already provided by the user', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          budget: 99999,
          departmentName: 'Luján de Cuyo',
          categoryNames: ['Nightlife'],
          partySize: 5,
          availableDuration: 500,
        }),
      });

      const result = await service.interpretIntent({
        ...baseInput,
        context: { budget: 15000, partySize: 2 },
      });

      expect(result.budget).toBe(15000);
      expect(result.partySize).toBe(2);
      expect(result.departmentName).toBe('Luján de Cuyo');
    });

    it('discards a department name that is not part of the candidate list', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          budget: null,
          departmentName: 'Ciudad Inexistente',
          categoryNames: [],
          partySize: null,
          availableDuration: null,
        }),
      });

      const result = await service.interpretIntent(baseInput);

      expect(result.departmentName).toBeNull();
    });

    it('discards category names that are not part of the candidate list', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          budget: null,
          departmentName: null,
          categoryNames: ['Gastronomy', 'Made Up Category'],
          partySize: null,
          availableDuration: null,
        }),
      });

      const result = await service.interpretIntent(baseInput);

      expect(result.categoryNames).toEqual(['Gastronomy']);
    });

    it('throws a retryable error when Gemini returns invalid JSON', async () => {
      generateContentMock.mockResolvedValueOnce({ text: 'not json' });

      await expect(service.interpretIntent(baseInput)).rejects.toThrow(
        RetryableJobError,
      );
    });

    it('throws a retryable error when Gemini returns no text at all', async () => {
      generateContentMock.mockResolvedValueOnce({ text: undefined });

      await expect(service.interpretIntent(baseInput)).rejects.toThrow(
        RetryableJobError,
      );
    });

    it('throws a retryable error when the underlying call fails', async () => {
      generateContentMock.mockRejectedValueOnce(new Error('network error'));

      await expect(service.interpretIntent(baseInput)).rejects.toThrow(
        RetryableJobError,
      );
    });

    it('applies a request timeout so a hung call does not block the worker indefinitely', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          budget: null,
          departmentName: null,
          categoryNames: [],
          partySize: null,
          availableDuration: null,
        }),
      });

      await service.interpretIntent(baseInput);

      const [[call]] = generateContentMock.mock.calls as [
        [{ config?: { httpOptions?: { timeout?: number } } }],
      ];
      expect(call.config?.httpOptions?.timeout).toBeGreaterThan(0);
    });
  });

  describe('composePlans (CU17)', () => {
    const baseInput: ComposePlansInput = {
      rawQuery: 'algo tranquilo para cenar',
      budget: 30000,
      availableDuration: 180,
      partySize: 2,
      candidates: [
        {
          id: 1,
          name: 'Wine tasting',
          description: 'desc',
          estimatedCost: 15000,
          estimatedDuration: 90,
          categoryNames: ['Gastronomy'],
        },
        {
          id: 2,
          name: 'Coffee walk',
          description: 'desc',
          estimatedCost: 5000,
          estimatedDuration: 60,
          categoryNames: ['Gastronomy'],
        },
      ],
    };

    it('returns plans built exclusively from candidate ids, renumbering order from 1', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          plans: [
            {
              title: 'Tarde de vinos',
              description: 'Un paseo por bodegas',
              activities: [
                { activityId: 1, order: 1 },
                { activityId: 2, order: 2 },
              ],
            },
          ],
        }),
      });

      const result = await service.composePlans(baseInput);

      expect(result).toEqual([
        {
          title: 'Tarde de vinos',
          description: 'Un paseo por bodegas',
          activities: [
            { activityId: 1, order: 1 },
            { activityId: 2, order: 2 },
          ],
        },
      ]);
    });

    it('never uses grounding tools for plan composition', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({ plans: [] }),
      });

      await service.composePlans(baseInput);

      const [[call]] = generateContentMock.mock.calls as [
        [{ config?: { tools?: unknown } }],
      ];
      expect(call.config?.tools).toBeUndefined();
    });

    it('discards an activity id that is not part of the candidate set', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          plans: [
            {
              title: 'Plan',
              description: 'desc',
              activities: [
                { activityId: 1, order: 1 },
                { activityId: 999, order: 2 },
              ],
            },
          ],
        }),
      });

      const result = await service.composePlans(baseInput);

      expect(result[0].activities).toEqual([{ activityId: 1, order: 1 }]);
    });

    it('drops a plan entirely when none of its activities survive validation', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({
          plans: [
            {
              title: 'Invented plan',
              description: 'desc',
              activities: [{ activityId: 999, order: 1 }],
            },
          ],
        }),
      });

      const result = await service.composePlans(baseInput);

      expect(result).toEqual([]);
    });

    it('throws a retryable error when Gemini returns invalid JSON', async () => {
      generateContentMock.mockResolvedValueOnce({ text: 'not json' });

      await expect(service.composePlans(baseInput)).rejects.toThrow(
        RetryableJobError,
      );
    });

    it('throws a retryable error when Gemini returns no text at all', async () => {
      generateContentMock.mockResolvedValueOnce({ text: undefined });

      await expect(service.composePlans(baseInput)).rejects.toThrow(
        RetryableJobError,
      );
    });

    it('throws a retryable error when the underlying call fails', async () => {
      generateContentMock.mockRejectedValueOnce(new Error('network error'));

      await expect(service.composePlans(baseInput)).rejects.toThrow(
        RetryableJobError,
      );
    });

    it('applies a request timeout so a hung call does not block the worker indefinitely', async () => {
      generateContentMock.mockResolvedValueOnce({
        text: JSON.stringify({ plans: [] }),
      });

      await service.composePlans(baseInput);

      const [[call]] = generateContentMock.mock.calls as [
        [{ config?: { httpOptions?: { timeout?: number } } }],
      ];
      expect(call.config?.httpOptions?.timeout).toBeGreaterThan(0);
    });
  });
});
