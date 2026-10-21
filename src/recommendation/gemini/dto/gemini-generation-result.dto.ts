export interface GroundedPlace {
  title: string;
  uri: string;
  placeId: string | null;
}

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

export interface GeminiGenerationResultDto {
  plan: GeminiProposedPlan;
  groundedPlaces: GroundedPlace[];
  metrics: {
    grounding: CallMetrics;
    structuring: CallMetrics;
    mapsGroundingRequestCount: number;
    totalLatencyMs: number;
    budgetRespected: boolean;
  };
}
