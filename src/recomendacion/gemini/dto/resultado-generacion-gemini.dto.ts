/**
 * Metadata real de un lugar, tal como la devuelve `groundingChunks[].maps`.
 *
 * `placeId` es opcional a propósito: no se sintetiza si la API no lo trae
 * para un chunk puntual — ver skills/04-calidad/, no se inventan datos.
 */
export interface LugarGroundeado {
  titulo: string;
  uri: string;
  placeId: string | null;
}

/**
 * Ítem propuesto por Gemini para el plan. No es un `DetallePlan` real: no
 * tiene `idActividad` porque el catálogo de `Actividad` está vacío (spike,
 * no persiste — ver AGENTS.md y el plan del ticket #32).
 */
export interface ActividadPropuestaGemini {
  nombre: string;
  descripcion: string;
  lugarSugerido: string;
  direccionAproximada: string | null;
  costoEstimado: number;
  duracionEstimadaMinutos: number;
  orden: number;
}

export interface PlanPropuestoGemini {
  titulo: string;
  descripcion: string;
  costoTotalEstimado: number;
  duracionTotalEstimadaMinutos: number;
  actividades: ActividadPropuestaGemini[];
}

export interface MetricasLlamada {
  modelo: string;
  latenciaMs: number;
  tokensEntrada: number;
  tokensSalida: number;
  tokensTotal: number;
}

/**
 * Salida completa de una generación del spike, con evidencia para evaluar
 * el ticket #32: validez de la respuesta, cumplimiento de presupuesto y
 * coherencia/verificabilidad de los lugares.
 */
export interface ResultadoGeneracionGeminiDto {
  plan: PlanPropuestoGemini;
  /**
   * Lugares reales devueltos por la llamada de grounding, sin filtrar ni
   * intentar mapear 1:1 contra las actividades propuestas. La
   * verificabilidad se evalúa comparando ambas listas manualmente en el
   * reporte del spike, no con un matching automático.
   */
  lugaresGroundeados: LugarGroundeado[];
  metricas: {
    grounding: MetricasLlamada;
    estructuracion: MetricasLlamada;
    cantidadRequestsMapsGrounding: number;
    latenciaTotalMs: number;
    presupuestoRespetado: boolean;
  };
}
