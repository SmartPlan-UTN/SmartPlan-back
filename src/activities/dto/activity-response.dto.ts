import type { PriceDto } from '../../common/pricing/price';
import type { PlaceSummaryDto } from '../../places/place-summary';

export interface CategorySummaryDto {
  id: number;
  name: string;
}

export interface ExternalRatingDto {
  rating: number;
  ratingCount: number;
  /** Provider of the rating: the UI must attribute it (Google Maps terms). */
  source: 'google';
}

export interface ExternalPriceDto {
  /** Place-level range as Google reported it; either bound may be null. */
  min: number | null;
  max: number | null;
  currency: string | null;
  /** Coarse Google level (e.g. PRICE_LEVEL_MODERATE), never an amount. */
  level: string | null;
  source: 'google';
}

export interface ActivityLocationDto {
  id: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  /** Google Place ID: an identity link, never provider content. */
  googlePlaceId: string | null;
  externalRating: ExternalRatingDto | null;
  /** Temporary place-level Google price estimate; attribute it. */
  externalPrice: ExternalPriceDto | null;
  place: {
    id: number;
    name: string;
    description: string | null;
    address: string;
    kind: string | null;
    department: {
      id: number;
      name: string;
      city: {
        id: number;
        name: string;
        country: { id: number; name: string };
      };
    };
  };
}

export interface ActivitySummaryDto {
  costBasis?: 'per_party' | 'per_person';
  id: number;
  imageUrl: string | null;
  name: string;
  description: string;
  /** Lower bound of the price; `null` when the price is unknown (never 0). */
  estimatedCost: number | null;
  price: PriceDto;
  estimatedDuration: number;
  /** `ActivitySubtype` key (what the person does). */
  type: string | null;
  /** Spanish label of `type`. */
  typeLabel: string | null;
  /** Months (1-12) the activity runs in; null = all year. */
  availableMonths: number[] | null;
  inSeason: boolean;
  /** SmartPlan's own average; null when nobody rated it (never 0). */
  averageRating: number | null;
  ratingCount: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
  /**
   * The place the card refers to (closest one when a position is given),
   * with its Google identity and live, attributed provider context.
   */
  place: PlaceSummaryDto | null;
}

export interface ActivityDetailDto extends ActivitySummaryDto {
  planEligible: boolean;
  costBasis: 'per_party' | 'per_person';
  availableTimesOfDay: string[];
  minPeople: number | null;
  maxPeople: number | null;
  images: import('../../media/dto/media-response.dto').MediaImageDto[];
  locations: ActivityLocationDto[];
}

export interface ActivityMapMarkerDto {
  id: number;
  itemType: 'ACTIVITY';
  activityId: number;
  placeId: number;
  name: string;
  placeName: string;
  address: string;
  estimatedCost: number | null;
  price: PriceDto;
  type: string | null;
  typeLabel: string | null;
  /** SmartPlan's own average; null when nobody rated it (never 0). */
  averageRating: number | null;
  ratingCount: number;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
  place: PlaceSummaryDto | null;
}
