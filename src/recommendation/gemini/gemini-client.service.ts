import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { CommonEnvironmentVariables } from '../../config/environment-variables';
import { RetryableJobError } from '../../messaging/errors/retryable-job-error';
import { GenerateGeminiPlanDto } from './dto/generate-gemini-plan.dto';
import {
  GroundedPlace,
  CallMetrics,
  GeminiProposedPlan,
  GeminiGenerationResultDto,
} from './dto/gemini-generation-result.dto';
import {
  InterpretIntentInput,
  InterpretedIntent,
} from './dto/interpret-intent.dto';
import {
  ComposePlansInput,
  ComposedPlan,
  ComposedPlansResult,
} from './dto/compose-plans.dto';

const INTERPRET_INTENT_TIMEOUT_MS = 15_000;
const COMPOSE_PLANS_TIMEOUT_MS = 20_000;

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
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
  ) {
    this.client = new GoogleGenAI({
      apiKey: this.configuration.get('GEMINI_API_KEY', { infer: true }),
    });
    this.model = this.configuration.get('GEMINI_MODEL', { infer: true });
  }

  /**
   * Interprets a user's free-text query plus any explicit context chips into
   * structured intent. Does not use grounding: the candidate departments and
   * categories are supplied by the caller from the real catalog, and Gemini
   * only picks names from among them (or leaves a field unresolved) — it
   * never invents an id, and the caller is the one that resolves a returned
   * name back to a real row before trusting it.
   */
  async interpretIntent(
    input: InterpretIntentInput,
  ): Promise<InterpretedIntent> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.buildInterpretIntentPrompt(input),
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: this.interpretIntentJsonSchema(),
          httpOptions: { timeout: INTERPRET_INTENT_TIMEOUT_MS },
        },
      });

      return this.parseInterpretedIntent(response.text, input);
    } catch (error) {
      if (error instanceof RetryableJobError) throw error;

      this.logger.error('Gemini intent interpretation failed', error);
      throw new RetryableJobError('Gemini intent interpretation failed', error);
    }
  }

  private buildInterpretIntentPrompt(input: InterpretIntentInput): string {
    const departmentNames = input.candidateDepartments
      .map((department) => department.name)
      .join(', ');
    const categoryNames = input.candidateCategories
      .map((category) => category.name)
      .join(', ');

    return [
      'Extract structured parameters from a user request for a recreational outing plan.',
      `User request (in Spanish): "${input.rawQuery}"`,
      input.context.budget != null
        ? `The user already specified a budget of ${input.context.budget}; do not reinterpret it.`
        : '',
      input.context.departmentName
        ? `The user already specified a location chip: "${input.context.departmentName}".`
        : '',
      input.context.partySize != null
        ? `The user already specified ${input.context.partySize} people.`
        : '',
      input.context.availableDuration != null
        ? `The user already specified ${input.context.availableDuration} minutes available.`
        : '',
      `Only choose a department name from this exact list, or leave it null if none matches: ${departmentNames}.`,
      `Only choose category names from this exact list, or leave the list empty if none matches: ${categoryNames}.`,
      'Return budget as a plain number in Argentine pesos if mentioned or implied, otherwise null.',
      'Return availableDuration in minutes if mentioned or implied, otherwise null.',
      'Return partySize as an integer if mentioned or implied, otherwise null.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private interpretIntentJsonSchema(): unknown {
    return {
      type: 'object',
      properties: {
        budget: { type: ['number', 'null'] },
        departmentName: { type: ['string', 'null'] },
        categoryNames: { type: 'array', items: { type: 'string' } },
        partySize: { type: ['integer', 'null'] },
        availableDuration: { type: ['integer', 'null'] },
      },
      required: [
        'budget',
        'departmentName',
        'categoryNames',
        'partySize',
        'availableDuration',
      ],
    };
  }

  private parseInterpretedIntent(
    text: string | undefined,
    input: InterpretIntentInput,
  ): InterpretedIntent {
    if (!text) {
      throw new RetryableJobError(
        'Gemini returned no text for intent interpretation',
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new RetryableJobError(
        `Gemini intent response is not valid JSON: ${text.slice(0, 200)}`,
      );
    }

    if (!this.isInterpretedIntentShape(data)) {
      throw new RetryableJobError(
        `Gemini intent response does not match the expected shape: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }

    const validDepartmentNames = new Set(
      input.candidateDepartments.map((department) => department.name),
    );
    const validCategoryNames = new Set(
      input.candidateCategories.map((category) => category.name),
    );

    return {
      budget: input.context.budget ?? data.budget,
      departmentName:
        input.context.departmentName ??
        (data.departmentName && validDepartmentNames.has(data.departmentName)
          ? data.departmentName
          : null),
      categoryNames: data.categoryNames.filter((name) =>
        validCategoryNames.has(name),
      ),
      partySize: input.context.partySize ?? data.partySize,
      availableDuration:
        input.context.availableDuration ?? data.availableDuration,
    };
  }

  private isInterpretedIntentShape(data: unknown): data is {
    budget: number | null;
    departmentName: string | null;
    categoryNames: string[];
    partySize: number | null;
    availableDuration: number | null;
  } {
    if (typeof data !== 'object' || data === null) return false;
    const value = data as Record<string, unknown>;
    return (
      (typeof value.budget === 'number' || value.budget === null) &&
      (typeof value.departmentName === 'string' ||
        value.departmentName === null) &&
      Array.isArray(value.categoryNames) &&
      value.categoryNames.every((name) => typeof name === 'string') &&
      (typeof value.partySize === 'number' || value.partySize === null) &&
      (typeof value.availableDuration === 'number' ||
        value.availableDuration === null)
    );
  }

  /**
   * Composes one or more full plans by picking and ordering activities from
   * a real candidate set already resolved from the catalog (department +
   * category filters applied by the caller). Does not use grounding: Gemini
   * only ever returns candidate ids and an order, never an invented
   * activity — the caller validates every returned id against the
   * candidate set before persisting anything.
   */
  async composePlans(input: ComposePlansInput): Promise<ComposedPlan[]> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.buildComposePlansPrompt(input),
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: this.composePlansJsonSchema(),
          httpOptions: { timeout: COMPOSE_PLANS_TIMEOUT_MS },
        },
      });

      return this.parseComposedPlans(response.text, input);
    } catch (error) {
      if (error instanceof RetryableJobError) throw error;

      this.logger.error('Gemini plan composition failed', error);
      throw new RetryableJobError('Gemini plan composition failed', error);
    }
  }

  private buildComposePlansPrompt(input: ComposePlansInput): string {
    const candidatesList = input.candidates
      .map(
        (candidate) =>
          `{id: ${candidate.id}, name: "${candidate.name}", categories: [${candidate.categoryNames.join(', ')}], estimatedCost: ${candidate.estimatedCost}, estimatedDurationMinutes: ${candidate.estimatedDuration}}`,
      )
      .join('\n');

    return [
      'Build one or more recreational outing plans in Spanish, each as an ordered sequence of activities picked exclusively from the candidate list below.',
      'Never invent an activity or an id: only use ids that appear in the candidate list.',
      input.rawQuery ? `User request (in Spanish): "${input.rawQuery}"` : '',
      input.budget != null
        ? `Total budget available: ARS ${input.budget}. The sum of the chosen activities' estimatedCost should not exceed it.`
        : '',
      input.availableDuration != null
        ? `Total available time: ${input.availableDuration} minutes. The sum of the chosen activities' estimatedDurationMinutes should not exceed it.`
        : '',
      input.partySize != null ? `Party size: ${input.partySize}.` : '',
      'Candidate activities:',
      candidatesList,
      'Return between 1 and 3 alternative plans, each with a short title and description in Spanish, and an ordered list of chosen activity ids (order starts at 1).',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private composePlansJsonSchema(): unknown {
    return {
      type: 'object',
      properties: {
        plans: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              activities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    activityId: { type: 'integer' },
                    order: { type: 'integer' },
                  },
                  required: ['activityId', 'order'],
                },
              },
            },
            required: ['title', 'description', 'activities'],
          },
        },
      },
      required: ['plans'],
    };
  }

  private parseComposedPlans(
    text: string | undefined,
    input: ComposePlansInput,
  ): ComposedPlan[] {
    if (!text) {
      throw new RetryableJobError(
        'Gemini returned no text for plan composition',
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new RetryableJobError(
        `Gemini composition response is not valid JSON: ${text.slice(0, 200)}`,
      );
    }

    if (!this.isComposedPlansShape(data)) {
      throw new RetryableJobError(
        `Gemini composition response does not match the expected shape: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }

    const validIds = new Set(input.candidates.map((candidate) => candidate.id));

    return data.plans
      .map((plan) => ({
        title: plan.title,
        description: plan.description,
        activities: plan.activities
          .filter((activity) => validIds.has(activity.activityId))
          .sort((a, b) => a.order - b.order)
          .map((activity, index) => ({
            activityId: activity.activityId,
            order: index + 1,
          })),
      }))
      .filter((plan) => plan.activities.length > 0);
  }

  private isComposedPlansShape(data: unknown): data is ComposedPlansResult {
    if (typeof data !== 'object' || data === null) return false;
    const value = data as Record<string, unknown>;
    if (!Array.isArray(value.plans)) return false;

    return value.plans.every((plan: unknown) => {
      if (typeof plan !== 'object' || plan === null) return false;
      const candidatePlan = plan as Record<string, unknown>;
      return (
        typeof candidatePlan.title === 'string' &&
        typeof candidatePlan.description === 'string' &&
        Array.isArray(candidatePlan.activities) &&
        candidatePlan.activities.every((activity: unknown) => {
          if (typeof activity !== 'object' || activity === null) return false;
          const candidateActivity = activity as Record<string, unknown>;
          return (
            typeof candidateActivity.activityId === 'number' &&
            typeof candidateActivity.order === 'number'
          );
        })
      );
    });
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
