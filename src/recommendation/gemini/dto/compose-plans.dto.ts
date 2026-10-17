import { CandidateActivity } from '../../dto/candidate-activity.dto';
import { TimeOfDay } from '../../../activities/activity-constraints';
import type { TravelMode } from '../../../common/types/travel-mode';

export interface ComposePlansInput {
  planRequestId?: number;
  rawQuery: string | null;
  budget: number | null;
  availableDuration: number | null;
  partySize: number | null;
  candidates: CandidateActivity[];
  timeOfDay?: TimeOfDay | null;
  travelMode?: TravelMode;
  timeoutMs?: number;
  retryInvalidResult?: boolean;
}

export interface ComposedPlanActivity {
  activityId: number;
  order: number;
}

export interface ComposedPlan {
  title: string;
  description: string;
  activities: ComposedPlanActivity[];
}

export interface ComposedPlansResult {
  plans: ComposedPlan[];
}
