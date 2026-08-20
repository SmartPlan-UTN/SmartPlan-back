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
  texto: string;
  places: GroundedPlace[];
  metrics: CallMetrics;
}

interface ResultadoEstructuracion {
  plan: GeminiProposedPlan;
  metrics: CallMetrics;
}

/**
 * Cliente del spike de integración con Gemini (ticket #32).
 *
 * Hace DOS llamadas a `generateContent`, no una: Structured Outputs
 * (`responseJsonSchema`) y Grounding with Google Maps (`tools:
 * [{googleMaps}]`) no son compatibles en la misma llamada hoy — la API
 * devuelve 400 ("Google Maps tool with a response mime type:
 * 'application/json' is unsupported") si se combinan. La primera llamada
 * busca places reales; la secondRun usa esos places como context textual
 * para forzar el plan en JSON. Ver el plan del ticket #32 para el detail
 * de esta decisión.
 */
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

  async generarPlan(
    input: GenerateGeminiPlanDto,
  ): Promise<GeminiGenerationResultDto> {
    try {
      const grounding = await this.buscarPlaces(input);
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
      // No se filtra el error crudo del SDK (puede traer details de la
      // request/headers) — se loguea server-side y se traduce.
      this.logger.error('Falló la generación de plan con Gemini', error);
      throw new InternalServerErrorException(
        'No se pudo generar el plan con el provider de IA.',
      );
    }
  }

  /**
   * Llamada 1: SOLO Grounding with Google Maps, sin structured output.
   *
   * Pide explícitamente resultados en español vía `retrievalConfig.languageCode`
   * y en el propio prompt — el spike debe registrar si la herramienta lo
   * respeta o si hay contenido que llega en otro idioma (ver reporte manual).
   */
  private async buscarPlaces(
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
            languageCode: 'es-AR',
            latLng: { latitude: input.latitude, longitude: input.longitude },
          },
        },
      },
    });

    const latencyMs = Date.now() - home;
    const uso = response.usageMetadata;
    const chunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    const places: GroundedPlace[] = chunks
      .map((chunk) => chunk.maps)
      .filter((maps): maps is NonNullable<typeof maps> => maps !== undefined)
      .map((maps) => ({
        title: maps.title ?? '',
        uri: maps.uri ?? '',
        // No se sintetiza un placeId cuando la API no lo trae para un chunk.
        placeId: maps.placeId ?? null,
      }));

    return {
      texto: response.text ?? '',
      places,
      metrics: {
        model: this.model,
        latencyMs,
        inputTokens: uso?.promptTokenCount ?? 0,
        outputTokens: uso?.candidatesTokenCount ?? 0,
        totalTokens: uso?.totalTokenCount ?? 0,
      },
    };
  }

  /**
   * Llamada 2: SOLO structured output, sin tools, usando el texto de la
   * llamada de grounding como context. Pide explícitamente el plan en
   * español, incluso si el context de grounding trajera texto en otro
   * idioma.
   */
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
    const uso = response.usageMetadata;

    const plan = this.parsearPlan(response.text);

    return {
      plan,
      metrics: {
        model: this.model,
        latencyMs,
        inputTokens: uso?.promptTokenCount ?? 0,
        outputTokens: uso?.candidatesTokenCount ?? 0,
        totalTokens: uso?.totalTokenCount ?? 0,
      },
    };
  }

  private parsearPlan(texto: string | undefined): GeminiProposedPlan {
    if (!texto) {
      throw new Error('Gemini no devolvió texto en la response estructurada.');
    }

    let data: unknown;
    try {
      data = JSON.parse(texto);
    } catch {
      throw new Error(
        `La response de Gemini no es JSON válido: ${texto.slice(0, 200)}`,
      );
    }

    if (!this.isValidPlan(data)) {
      throw new Error(
        `La response de Gemini no cumple el shape esperado del plan: ${JSON.stringify(data).slice(0, 200)}`,
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
      'Actuás como un asistente de planificación de salidas recreativas en Mendoza, Argentina.',
      'Respondé siempre en español (es-AR).',
      `Buscá places reales (restaurantes, bares, cafés, paseos) cerca de la ubicación`,
      `latitude ${input.latitude}, longitude ${input.longitude},`,
      `adecuados para ${input.peopleCount} persona(s),`,
      `con estas preferences: ${input.preferences.join(', ')}.`,
      `Presupuesto total available: ARS ${input.budget}.`,
      `Tiempo available: ${input.availableDurationMinutes} minutos.`,
      input.notes ? `Observaciones del user: ${input.notes}.` : '',
      'Listá los places reales encontrados con una breve descripción de cada uno.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private armarPromptEstructuracion(
    input: GenerateGeminiPlanDto,
    grounding: ResultadoGrounding,
  ): string {
    return [
      'Con base en los siguientes places reales encontrados en Mendoza, Argentina:',
      grounding.texto,
      '',
      'Armá un plan de salida recreativa, en español, como una secuencia orderada de activities',
      `para ${input.peopleCount} persona(s), con preferences: ${input.preferences.join(', ')},`,
      `que respete un budget total de ARS ${input.budget}`,
      `y una duración total de hasta ${input.availableDurationMinutes} minutos.`,
      'Usá los places reales listados arriba cuando sea posible, sin inventar places que no figuren ahí.',
      'Devolvé el plan completo en español, incluyendo títulos y descriptiones.',
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
