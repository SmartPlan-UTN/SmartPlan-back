/**
 * Metadata real de un place, tal como la devuelve `groundingChunks[].maps`.
 *
 * `placeId` es opcional a propósito: no se sintetiza si la API no lo trae
 * para un chunk puntual — ver skills/04-quality/, no se inventan data.
 */
export interface GroundedPlace {
  title: string;
  uri: string;
  placeId: string | null;
}

/**
 * Ítem propuesto por Gemini para el plan. No es un `PlanDetail` real: no
 * tiene `idActivity` porque el catálogo de `Activity` está vacío (spike,
 * no persiste — ver AGENTS.md y el plan del ticket #32).
 */
export interface GeminiProposedActivity {
  name: string;
  description: string;
  suggestedPlace: string;
  approximateAddress: string | null;
  estimatedCost: number;
  estimatedDurationMinutes: number;
  order: number;
}

export interface GeminiProposedPlan {
  title: string;
  description: string;
  estimatedTotalCost: number;
  estimatedTotalDurationMinutes: number;
  activities: GeminiProposedActivity[];
}

export interface CallMetrics {
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Salida completa de una generación del spike, con evidencia para evaluar
 * el ticket #32: validez de la response, cumplimiento de budget y
 * coherencia/verificabilidad de los places.
 */
export interface GeminiGenerationResultDto {
  plan: GeminiProposedPlan;
  /**
   * Places reales devueltos por la llamada de grounding, sin filtrar ni
   * intentar mapear 1:1 contra las activities propuestas. La
   * verificabilidad se evalúa comparando ambas listas manualmente en el
   * reporte del spike, no con un matching automático.
   */
  groundedPlaces: GroundedPlace[];
  metrics: {
    grounding: CallMetrics;
    structuring: CallMetrics;
    mapsGroundingRequestCount: number;
    totalLatencyMs: number;
    budgetRespected: boolean;
  };
}
