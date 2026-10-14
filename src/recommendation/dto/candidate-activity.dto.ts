import { ActivityConstraints } from '../../activities/activity-constraints';

export interface CandidateActivity extends ActivityConstraints {
  id: number;
  name: string;
  description: string;
  estimatedCost: number;
  unitEstimatedCost?: number;
  estimatedDuration: number;
  categoryNames: string[];
  latitude: number | null;
  longitude: number | null;
  categoryIds?: number[];
  distanceKm?: number | null;
  relevanceScore?: number;
  averageRating?: number | null;
}
