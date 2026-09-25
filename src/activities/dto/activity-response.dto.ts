export interface CategorySummaryDto {
  id: number;
  name: string;
}

export interface ExternalRatingDto {
  rating: number;
  ratingCount: number;
}

export interface ActivityLocationDto {
  id: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  externalRating: ExternalRatingDto | null;
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
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  type: string | null;
  averageRating: number;
  ratingCount: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
}

export interface ActivityDetailDto extends ActivitySummaryDto {
  locations: ActivityLocationDto[];
}

export interface ActivityMapMarkerDto {
  id: number;
  activityId: number;
  placeId: number;
  name: string;
  placeName: string;
  address: string;
  estimatedCost: number;
  type: string | null;
  averageRating: number;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
}
