import type { PriceFields } from '../../common/pricing/price';

export interface CandidateActivity {
  id: number;
  name: string;
  description: string;
  /** Lower bound of the price; candidates always have a known price. */
  estimatedCost: number | null;
  price: PriceFields;
  estimatedDuration: number;
  categoryNames: string[];
  latitude: number | null;
  longitude: number | null;
}
