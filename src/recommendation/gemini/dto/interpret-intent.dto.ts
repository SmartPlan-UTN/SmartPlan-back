import type { TimeOfDay } from '../../../activities/activity-constraints';
import type { TravelMode } from '../../../common/types/travel-mode';

export interface InterpretIntentInput {
  planRequestId?: number;
  rawQuery: string;
  context: {
    travelMode?: TravelMode;
    budget?: number;
    departmentName?: string;
    partySize?: number;
    timeOfDay?: string;
    availableDuration?: number;
    maxDistanceKm?: number;
  };
  knownBudget?: number;
  knownDepartmentId?: number;
  knownPartySize?: number;
  knownAvailableDuration?: number;
  candidateDepartments: Array<{ id: number; name: string }>;
  candidateCategories: Array<{ id: number; name: string }>;
}

/** One facet as the model read it (closed vocabulary, validated). */
export interface InterpretedFacet {
  dimension: string;
  value: string;
  polarity: 'want' | 'avoid';
  strength: 'soft' | 'hard';
  confidence: number;
  /** The person's own words behind it. */
  phrase: string | null;
}

export interface InterpretedIntent {
  /** The semantic reading of the request, in SmartPlan's closed vocabulary. */
  facets?: InterpretedFacet[];
  /** Actions the request asks for, from the closed experience list. */
  experiences?: string[];
  budgetBasis?: 'per_party' | 'per_person';
  travelMode?: TravelMode | null;
  excludedCategoryNames?: string[];
  maxDistanceKm?: number | null;
  timeOfDay?: TimeOfDay | null;
  budget: number | null;
  departmentName: string | null;
  categoryNames: string[];
  partySize: number | null;
  availableDuration: number | null;
}
