import type { Occasion } from '../../../catalog/taxonomy';
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
    /** Chips from the composer: stay home, free only, explicit occasions. */
    atHome?: boolean;
    freeOnly?: boolean;
    occasions?: string[];
  };
  knownBudget?: number;
  knownDepartmentId?: number;
  knownPartySize?: number;
  knownAvailableDuration?: number;
  candidateDepartments: Array<{ id: number; name: string }>;
  candidateCategories: Array<{ id: number; name: string }>;
}

export interface InterpretedIntent {
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
  /** Who it is for and its mood ("con mi novia" -> romantic). */
  occasions?: Occasion[];
  /** The user wants to stay home ("en casa"). */
  atHome?: boolean;
  /** The user wants it free ("gratis", "sin gastar"). */
  freeOnly?: boolean;
}
