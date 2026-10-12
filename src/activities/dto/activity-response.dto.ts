import type { PriceDto } from '../../common/pricing/price';

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
  id: number;
  imageUrl: string | null;
  name: string;
  description: string;
  /** Lower bound of the price; `null` when the price is unknown (never 0). */
  estimatedCost: number | null;
  price: PriceDto;
  estimatedDuration: number;
  type: string | null;
  averageRating: number;
  ratingCount: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
}

export interface ActivityDetailDto extends ActivitySummaryDto {
  images: import('../../media/dto/media-response.dto').MediaImageDto[];
  locations: ActivityLocationDto[];
}

export interface ActivityMapMarkerDto {
  id: number;
  activityId: number;
  placeId: number;
  name: string;
  placeName: string;
  address: string;
  estimatedCost: number | null;
  price: PriceDto;
  type: string | null;
  averageRating: number;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
}
