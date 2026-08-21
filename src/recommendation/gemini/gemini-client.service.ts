import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { EnvironmentVariables } from '../../config/environment-variables';
import { GenerateGeminiPlanDto } from './dto/generate-gemini-plan.dto';
import {
  GroundedPlace,
  CallMetrics,
  GeminiProposedPlan,
  GeminiGenerationResultDto,
} from './dto/gemini-generation-result.dto';

interface ResultadoGrounding {
  text: string;
  places: GroundedPlace[];
  metrics: CallMetrics;
}

interface ResultadoEstructuracion {
  plan: GeminiProposedPlan;
  metrics: CallMetrics;
}

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {
    this.client = new GoogleGenAI({
      apiKey: this.configuration.get('GEMINI_API_KEY', { infer: true }),
    });
    this.model = this.configuration.get('GEMINI_MODEL', { infer: true });
  }

  async generatePlan(
    input: GenerateGeminiPlanDto,
  ): Promise<GeminiGenerationResultDto> {
    try {
      const grounding = await this.searchPlaces(input);
      const structuring = await this.structurePlan(input, grounding);

      return {
        plan: structuring.plan,
        groundedPlaces: grounding.places,
        metrics: {
          grounding: grounding.metrics,
          structuring: structuring.metrics,
          mapsGroundingRequestCount: 1,
          totalLatencyMs:
            grounding.metrics.latencyMs + structuring.metrics.latencyMs,
          budgetRespected: structuring.plan.estimatedTotalCost <= input.budget,
        },
      };
    } catch (error) {
      this.logger.error('Gemini plan generation failed', error);
      throw new InternalServerErrorException(
        'The AI provider could not generate the plan.',
      );
    }
  }

  private async searchPlaces(
    input: GenerateGeminiPlanDto,
  ): Promise<ResultadoGrounding> {
    const home = Date.now();

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: this.armarPromptGrounding(input),
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            languageCode: 'is-AR',
            latLng: { latitude: input.latitude, longitude: input.longitude },
          },
        },
      },
    });

    const latencyMs = Date.now() - home;
    const usage = response.usageMetadata;
    const chunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    const places: GroundedPlace[] = chunks
      .map((chunk) => chunk.maps)
      .filter((maps): maps is NonNullable<typeof maps> => maps !== undefined)
      .map((maps) => ({
        title: maps.title ?? '',
        uri: maps.uri ?? '',
        placeId: maps.placeId ?? null,
      }));

    return {
      text: response.text ?? '',
      places,
      metrics: {
        model: this.model,
        latencyMs,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    };
  }

  private async structurePlan(
    input: GenerateGeminiPlanDto,
    grounding: ResultadoGrounding,
  ): Promise<ResultadoEstructuracion> {
    const home = Date.now();

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: this.armarPromptEstructuracion(input, grounding),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: this.planJsonSchema(),
      },
    });

    const latencyMs = Date.now() - home;
    const usage = response.usageMetadata;

    const plan = this.parsePlan(response.text);

    return {
      plan,
      metrics: {
        model: this.model,
        latencyMs,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    };
  }

  private parsePlan(text: string | undefined): GeminiProposedPlan {
    if (!text) {
      throw new Error('Gemini returned no text in the structured response.');
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `The Gemini response is not valid JSON: ${text.slice(0, 200)}`,
      );
    }

    if (!this.isValidPlan(data)) {
      throw new Error(
        `The Gemini response does not match the expected plan shape: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }

    return data;
  }

  private isValidPlan(data: unknown): data is GeminiProposedPlan {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    const plan = data as Partial<GeminiProposedPlan>;
    return (
      typeof plan.title === 'string' &&
      typeof plan.estimatedTotalCost === 'number' &&
      typeof plan.estimatedTotalDurationMinutes === 'number' &&
      Array.isArray(plan.activities)
    );
  }

  private armarPromptGrounding(input: GenerateGeminiPlanDto): string {
    return [
      'Act as a recreational outing planning assistant in Mendoza, Argentina.',
      'Always respond in Spanish (es-AR).',
      `Find real places (restaurants, bars, cafes, and attractions) near the location`,
      `latitude ${input.latitude}, longitude ${input.longitude},`,
      `suitable for ${input.peopleCount} person(s),`,
      `with these preferences: ${input.preferences.join(', ')}.`,
      `Presupuesto total available: ARS ${input.budget}.`,
      `Available time: ${input.availableDurationMinutes} minutes.`,
      input.notes ? `Observaciones of the user: ${input.notes}.` : '',
      'List the real places found with a brief description of each one.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private armarPromptEstructuracion(
    input: GenerateGeminiPlanDto,
    grounding: ResultadoGrounding,
  ): string {
    return [
      'Based on the following real places found in Mendoza, Argentina:',
      grounding.text,
      '',
      'Build a recreational outing plan in Spanish as an ordered sequence of activities',
      `for ${input.peopleCount} person(s), with preferences: ${input.preferences.join(', ')},`,
      `within a total budget of ARS ${input.budget}`,
      `and a total duration of up to ${input.availableDurationMinutes} minutes.`,
      'Use the real places listed above whenever possible, without inventing places that are not listed.',
      'Return the complete plan in Spanish, including titles and descriptions.',
    ].join(' ');
  }

  private planJsonSchema(): unknown {
    const activity = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        suggestedPlace: { type: 'string' },
        approximateAddress: { type: ['string', 'null'] },
        estimatedCost: { type: 'number' },
        estimatedDurationMinutes: { type: 'number' },
        order: { type: 'number' },
      },
      required: [
        'name',
        'description',
        'suggestedPlace',
        'estimatedCost',
        'estimatedDurationMinutes',
        'order',
      ],
    };

    return {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        estimatedTotalCost: { type: 'number' },
        estimatedTotalDurationMinutes: { type: 'number' },
        activities: { type: 'array', items: activity },
      },
      required: [
        'title',
        'description',
        'estimatedTotalCost',
        'estimatedTotalDurationMinutes',
        'activities',
      ],
    };
  }
}
