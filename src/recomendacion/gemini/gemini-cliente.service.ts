import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { VariablesEntorno } from '../../config/variables-entorno';
import { GenerarPlanGeminiDto } from './dto/generar-plan-gemini.dto';
import {
  LugarGroundeado,
  MetricasLlamada,
  PlanPropuestoGemini,
  ResultadoGeneracionGeminiDto,
} from './dto/resultado-generacion-gemini.dto';

interface ResultadoGrounding {
  texto: string;
  lugares: LugarGroundeado[];
  metricas: MetricasLlamada;
}

interface ResultadoEstructuracion {
  plan: PlanPropuestoGemini;
  metricas: MetricasLlamada;
}

/**
 * Cliente del spike de integración con Gemini (ticket #32).
 *
 * Hace DOS llamadas a `generateContent`, no una: Structured Outputs
 * (`responseJsonSchema`) y Grounding with Google Maps (`tools:
 * [{googleMaps}]`) no son compatibles en la misma llamada hoy — la API
 * devuelve 400 ("Google Maps tool with a response mime type:
 * 'application/json' is unsupported") si se combinan. La primera llamada
 * busca lugares reales; la segunda usa esos lugares como contexto textual
 * para forzar el plan en JSON. Ver el plan del ticket #32 para el detalle
 * de esta decisión.
 */
@Injectable()
export class GeminiClienteService {
  private readonly logger = new Logger(GeminiClienteService.name);
  private readonly cliente: GoogleGenAI;
  private readonly modelo: string;

  constructor(
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
  ) {
    this.cliente = new GoogleGenAI({
      apiKey: this.configuracion.get('GEMINI_API_KEY', { infer: true }),
    });
    this.modelo = this.configuracion.get('GEMINI_MODEL', { infer: true });
  }

  async generarPlan(
    entrada: GenerarPlanGeminiDto,
  ): Promise<ResultadoGeneracionGeminiDto> {
    try {
      const grounding = await this.buscarLugares(entrada);
      const estructuracion = await this.estructurarPlan(entrada, grounding);

      return {
        plan: estructuracion.plan,
        lugaresGroundeados: grounding.lugares,
        metricas: {
          grounding: grounding.metricas,
          estructuracion: estructuracion.metricas,
          cantidadRequestsMapsGrounding: 1,
          latenciaTotalMs:
            grounding.metricas.latenciaMs + estructuracion.metricas.latenciaMs,
          presupuestoRespetado:
            estructuracion.plan.costoTotalEstimado <= entrada.presupuesto,
        },
      };
    } catch (error) {
      // No se filtra el error crudo del SDK (puede traer detalles de la
      // request/headers) — se loguea server-side y se traduce.
      this.logger.error('Falló la generación de plan con Gemini', error);
      throw new InternalServerErrorException(
        'No se pudo generar el plan con el proveedor de IA.',
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
  private async buscarLugares(
    entrada: GenerarPlanGeminiDto,
  ): Promise<ResultadoGrounding> {
    const inicio = Date.now();

    const respuesta = await this.cliente.models.generateContent({
      model: this.modelo,
      contents: this.armarPromptGrounding(entrada),
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            languageCode: 'es-AR',
            latLng: { latitude: entrada.latitud, longitude: entrada.longitud },
          },
        },
      },
    });

    const latenciaMs = Date.now() - inicio;
    const uso = respuesta.usageMetadata;
    const chunks =
      respuesta.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    const lugares: LugarGroundeado[] = chunks
      .map((chunk) => chunk.maps)
      .filter((maps): maps is NonNullable<typeof maps> => maps !== undefined)
      .map((maps) => ({
        titulo: maps.title ?? '',
        uri: maps.uri ?? '',
        // No se sintetiza un placeId cuando la API no lo trae para un chunk.
        placeId: maps.placeId ?? null,
      }));

    return {
      texto: respuesta.text ?? '',
      lugares,
      metricas: {
        modelo: this.modelo,
        latenciaMs,
        tokensEntrada: uso?.promptTokenCount ?? 0,
        tokensSalida: uso?.candidatesTokenCount ?? 0,
        tokensTotal: uso?.totalTokenCount ?? 0,
      },
    };
  }

  /**
   * Llamada 2: SOLO structured output, sin tools, usando el texto de la
   * llamada de grounding como contexto. Pide explícitamente el plan en
   * español, incluso si el contexto de grounding trajera texto en otro
   * idioma.
   */
  private async estructurarPlan(
    entrada: GenerarPlanGeminiDto,
    grounding: ResultadoGrounding,
  ): Promise<ResultadoEstructuracion> {
    const inicio = Date.now();

    const respuesta = await this.cliente.models.generateContent({
      model: this.modelo,
      contents: this.armarPromptEstructuracion(entrada, grounding),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: this.jsonSchemaDelPlan(),
      },
    });

    const latenciaMs = Date.now() - inicio;
    const uso = respuesta.usageMetadata;

    const plan = this.parsearPlan(respuesta.text);

    return {
      plan,
      metricas: {
        modelo: this.modelo,
        latenciaMs,
        tokensEntrada: uso?.promptTokenCount ?? 0,
        tokensSalida: uso?.candidatesTokenCount ?? 0,
        tokensTotal: uso?.totalTokenCount ?? 0,
      },
    };
  }

  private parsearPlan(texto: string | undefined): PlanPropuestoGemini {
    if (!texto) {
      throw new Error('Gemini no devolvió texto en la respuesta estructurada.');
    }

    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new Error(
        `La respuesta de Gemini no es JSON válido: ${texto.slice(0, 200)}`,
      );
    }

    if (!this.esPlanValido(datos)) {
      throw new Error(
        `La respuesta de Gemini no cumple el shape esperado del plan: ${JSON.stringify(datos).slice(0, 200)}`,
      );
    }

    return datos;
  }

  private esPlanValido(datos: unknown): datos is PlanPropuestoGemini {
    if (typeof datos !== 'object' || datos === null) {
      return false;
    }
    const plan = datos as Partial<PlanPropuestoGemini>;
    return (
      typeof plan.titulo === 'string' &&
      typeof plan.costoTotalEstimado === 'number' &&
      typeof plan.duracionTotalEstimadaMinutos === 'number' &&
      Array.isArray(plan.actividades)
    );
  }

  private armarPromptGrounding(entrada: GenerarPlanGeminiDto): string {
    return [
      'Actuás como un asistente de planificación de salidas recreativas en Mendoza, Argentina.',
      'Respondé siempre en español (es-AR).',
      `Buscá lugares reales (restaurantes, bares, cafés, paseos) cerca de la ubicación`,
      `latitud ${entrada.latitud}, longitud ${entrada.longitud},`,
      `adecuados para ${entrada.cantidadPersonas} persona(s),`,
      `con estas preferencias: ${entrada.preferencias.join(', ')}.`,
      `Presupuesto total disponible: ARS ${entrada.presupuesto}.`,
      `Tiempo disponible: ${entrada.duracionDisponibleMinutos} minutos.`,
      entrada.observaciones
        ? `Observaciones del usuario: ${entrada.observaciones}.`
        : '',
      'Listá los lugares reales encontrados con una breve descripción de cada uno.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private armarPromptEstructuracion(
    entrada: GenerarPlanGeminiDto,
    grounding: ResultadoGrounding,
  ): string {
    return [
      'Con base en los siguientes lugares reales encontrados en Mendoza, Argentina:',
      grounding.texto,
      '',
      'Armá un plan de salida recreativa, en español, como una secuencia ordenada de actividades',
      `para ${entrada.cantidadPersonas} persona(s), con preferencias: ${entrada.preferencias.join(', ')},`,
      `que respete un presupuesto total de ARS ${entrada.presupuesto}`,
      `y una duración total de hasta ${entrada.duracionDisponibleMinutos} minutos.`,
      'Usá los lugares reales listados arriba cuando sea posible, sin inventar lugares que no figuren ahí.',
      'Devolvé el plan completo en español, incluyendo títulos y descripciones.',
    ].join(' ');
  }

  private jsonSchemaDelPlan(): unknown {
    const actividad = {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        lugarSugerido: { type: 'string' },
        direccionAproximada: { type: ['string', 'null'] },
        costoEstimado: { type: 'number' },
        duracionEstimadaMinutos: { type: 'number' },
        orden: { type: 'number' },
      },
      required: [
        'nombre',
        'descripcion',
        'lugarSugerido',
        'costoEstimado',
        'duracionEstimadaMinutos',
        'orden',
      ],
    };

    return {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descripcion: { type: 'string' },
        costoTotalEstimado: { type: 'number' },
        duracionTotalEstimadaMinutos: { type: 'number' },
        actividades: { type: 'array', items: actividad },
      },
      required: [
        'titulo',
        'descripcion',
        'costoTotalEstimado',
        'duracionTotalEstimadaMinutos',
        'actividades',
      ],
    };
  }
}
