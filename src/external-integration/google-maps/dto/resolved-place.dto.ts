export interface ResolvedPlaceDto {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  ratingCount?: number;
  /**
   * Place-level price range, only when Google returned one. It describes the
   * place, not a specific activity, and is a temporary cache like the rating.
   */
  priceRange?: { min: number | null; max: number | null; currency: string };
  /** Coarse Google price level (never converted into an amount). */
  priceLevel?: string;
  businessStatus?: string;
}
