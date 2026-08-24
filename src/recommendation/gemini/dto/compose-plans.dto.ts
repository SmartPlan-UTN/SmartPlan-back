import { CandidateActivity } from '../../dto/candidate-activity.dto';

export interface ComposePlansInput {
  rawQuery: string | null;
  budget: number | null;
  availableDuration: number | null;
  partySize: number | null;
  candidates: CandidateActivity[];
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
