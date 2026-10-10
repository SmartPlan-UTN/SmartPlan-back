import type { PriceDto } from '../../common/pricing/price';

/** One catalog activity suggested for the plan being edited (#98). */
export interface ActivitySuggestionDto {
  id: number;
  name: string;
  description: string;
  estimatedCost: number | null;
  price: PriceDto;
  estimatedDuration: number;
  type: string | null;
  categories: string[];
}
