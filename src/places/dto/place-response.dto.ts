import type { DepartmentSummaryDto } from '../department-summary';
import type { PriceDto } from '../../common/pricing/price';
import type { PlaceSummaryDto } from '../place-summary';

/** An activity offered at a place (shown on the place's page). */
export interface PlaceActivityDto {
  id: number;
  name: string;
  type: string | null;
  typeLabel: string | null;
  estimatedDuration: number;
  price: PriceDto;
  planEligible: boolean;
}

export interface PlaceResponseDto {
  kind?: string | null;
  kindLabel?: string | null;
  /** Google identity and live, attributed provider context (detail only). */
  summary?: PlaceSummaryDto | null;
  activities?: PlaceActivityDto[];
  images?: import('../../media/dto/media-response.dto').MediaImageDto[];
  id: number;
  name: string;
  description: string | null;
  address: string;
  department: DepartmentSummaryDto | null;
}
