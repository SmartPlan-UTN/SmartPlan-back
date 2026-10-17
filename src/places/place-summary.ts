import type {
  ExternalPriceDto,
  ExternalRatingDto,
} from '../activities/dto/activity-response.dto';
import { placeKindLabel } from '../catalog/taxonomy';

/** An open-licensed photo of a place and the credit it must carry. */
export interface PlaceImageDto {
  url: string;
  license: string | null;
  author: string | null;
  sourceUrl: string | null;
}

/**
 * The place an Explore card, map marker or plan stop refers to, with the
 * provider identity and the TEMPORARY provider cache already filtered by
 * expiry (an expired cache is never returned, even before it is purged).
 */
export interface PlaceSummaryDto {
  id: number;
  name: string;
  kind: string | null;
  kindLabel: string | null;
  address: string;
  department: string | null;
  /** Google Place ID: identity link (photos, Maps link), never content. */
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  /** True when the coordinates are SmartPlan-owned (not a provider cache). */
  coordinatesOwned: boolean;
  externalRating: ExternalRatingDto | null;
  externalPrice: ExternalPriceDto | null;
  image: PlaceImageDto | null;
}

/**
 * `jsonb` expression summarising place `p` (department `d`). Provider cache
 * fields are only included while `external_expires_at` is in the future.
 */
export function placeSummaryJsonSql(p: string, d: string): string {
  const live = `"${p}"."external_expires_at" > now()`;
  return `jsonb_build_object(
    'id', "${p}"."id",
    'name', "${p}"."name",
    'kind', "${p}"."kind",
    'address', "${p}"."address",
    'department', "${d}"."name",
    'googlePlaceId', "${p}"."google_place_id",
    'latitude', COALESCE("${p}"."latitude", CASE WHEN ${live} THEN "${p}"."external_latitude" END),
    'longitude', COALESCE("${p}"."longitude", CASE WHEN ${live} THEN "${p}"."external_longitude" END),
    'coordinatesOwned', "${p}"."latitude" IS NOT NULL,
    'externalRating', CASE WHEN ${live} THEN "${p}"."external_rating" END,
    'externalRatingCount', CASE WHEN ${live} THEN "${p}"."external_rating_count" END,
    'externalPriceMin', CASE WHEN ${live} THEN "${p}"."external_price_min" END,
    'externalPriceMax', CASE WHEN ${live} THEN "${p}"."external_price_max" END,
    'externalPriceCurrency', CASE WHEN ${live} THEN "${p}"."external_price_currency" END,
    'externalPriceLevel', CASE WHEN ${live} THEN "${p}"."external_price_level" END,
    'imageUrl', "${p}"."image_url",
    'imageLicense', "${p}"."image_license",
    'imageAuthor', "${p}"."image_author",
    'imageSourceUrl', "${p}"."image_source_url"
  )`;
}

/** Effective latitude/longitude SQL of place `p` (owned, else live cache). */
export function placeLatitudeSql(p: string): string {
  return `COALESCE("${p}"."latitude", CASE WHEN "${p}"."external_expires_at" > now() THEN "${p}"."external_latitude" END)`;
}

export function placeLongitudeSql(p: string): string {
  return `COALESCE("${p}"."longitude", CASE WHEN "${p}"."external_expires_at" > now() THEN "${p}"."external_longitude" END)`;
}

/** Great-circle distance (km) from (:latitude, :longitude) to lat/lng SQL. */
export function distanceKmSql(latitude: string, longitude: string): string {
  return `(6371 * ACOS(LEAST(1, GREATEST(-1,
    COS(RADIANS(:latitude))
    * COS(RADIANS((${latitude})::double precision))
    * COS(RADIANS((${longitude})::double precision) - RADIANS(:longitude))
    + SIN(RADIANS(:latitude))
    * SIN(RADIANS((${latitude})::double precision))
  ))))`;
}

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** Maps the `jsonb` built by `placeSummaryJsonSql` (or null). */
export function toPlaceSummary(
  raw: Record<string, unknown> | null | undefined,
): PlaceSummaryDto | null {
  if (!raw) return null;
  const rating = num(raw.externalRating);
  const ratingCount = num(raw.externalRatingCount);
  const priceMin = num(raw.externalPriceMin);
  const priceMax = num(raw.externalPriceMax);
  const priceLevel = (raw.externalPriceLevel as string | null) ?? null;
  const hasAmount = priceMin !== null || priceMax !== null;
  const kind = (raw.kind as string | null) ?? null;
  return {
    id: Number(raw.id),
    name: String(raw.name),
    kind,
    kindLabel: placeKindLabel(kind),
    address: typeof raw.address === 'string' ? raw.address : '',
    department: (raw.department as string | null) ?? null,
    googlePlaceId: (raw.googlePlaceId as string | null) ?? null,
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    coordinatesOwned: Boolean(raw.coordinatesOwned),
    externalRating:
      rating !== null && ratingCount !== null && ratingCount > 0
        ? { rating, ratingCount, source: 'google' }
        : null,
    externalPrice:
      hasAmount || priceLevel
        ? {
            min: priceMin,
            max: priceMax,
            currency: hasAmount
              ? ((raw.externalPriceCurrency as string | null) ?? null)
              : null,
            level: priceLevel,
            source: 'google',
          }
        : null,
    image:
      typeof raw.imageUrl === 'string'
        ? {
            url: raw.imageUrl,
            license: (raw.imageLicense as string | null) ?? null,
            author: (raw.imageAuthor as string | null) ?? null,
            sourceUrl: (raw.imageSourceUrl as string | null) ?? null,
          }
        : null,
  };
}
