import { ActivityConstraints } from '../../activities/activity-constraints';
import type { PriceFields } from '../../common/pricing/price';

export interface CandidateActivity extends ActivityConstraints {
  id: number;
  name: string;
  description: string;
  /** Lower bound of the price; candidates always have a known price. */
  estimatedCost: number | null;
  price: PriceFields;
  unitEstimatedCost?: number;
  estimatedDuration: number;
  categoryNames: string[];
  latitude: number | null;
  longitude: number | null;
  categoryIds?: number[];
  distanceKm?: number | null;
  relevanceScore?: number;
  averageRating?: number | null;
  /** `Occasion` keys. */
  occasions?: string[];
  /** At the virtual Hogar: no coordinates, zero travel. */
  atHome?: boolean;
}
