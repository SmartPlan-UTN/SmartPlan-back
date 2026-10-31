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
  actions?: {
    action: string;
    label: string;
    durationMinutes: number;
    price: PriceDto;
  }[];
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
  department: {
    id: number;
    name: string;
    city: {
      id: number;
      name: string;
      country: { id: number; name: string };
    };
  };
}
