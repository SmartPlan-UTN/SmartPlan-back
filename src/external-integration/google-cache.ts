import type { ActivityPlace } from '../activities/entities/activity-place.entity';
import type { Place } from '../places/entities/place.entity';
import type { ResolvedPlaceDto } from './google-maps/dto/resolved-place.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single place that decides how provider (Google) content lands in the
 * TEMPORARY cache of a `place`, shared by the nightly sync and the on-demand
 * refresh so both obey the same rules:
 *
 * - everything carries one expiry (`ttlDays`, at most 30);
 * - coordinates are cached apart from SmartPlan-owned ones and never replace
 *   them;
 * - the place-level price range/level is cached, never converted or promoted
 *   to an activity's own price.
 */
export function applyProviderContent(
  place: Place,
  result: ResolvedPlaceDto,
  now: Date,
  ttlDays: number,
): void {
  place.externalLatitude = result.latitude;
  place.externalLongitude = result.longitude;

  if (result.rating === undefined || result.ratingCount === undefined) {
    place.externalRating = null;
    place.externalRatingCount = null;
  } else {
    place.externalRating = result.rating;
    place.externalRatingCount = result.ratingCount;
  }

  place.externalPriceMin = result.priceRange?.min ?? null;
  place.externalPriceMax = result.priceRange?.max ?? null;
  place.externalPriceCurrency = result.priceRange?.currency ?? null;
  place.externalPriceLevel = result.priceLevel ?? null;
  place.externalBusinessStatus = result.businessStatus ?? null;

  place.externalFetchedAt = now;
  place.externalExpiresAt = new Date(
    now.getTime() + Math.min(30, Math.max(1, ttlDays)) * DAY_MS,
  );
}

/** The provider no longer has the place, or the cache expired. */
export function dropProviderContent(place: Place): void {
  place.externalRating = null;
  place.externalRatingCount = null;
  place.externalPriceMin = null;
  place.externalPriceMax = null;
  place.externalPriceCurrency = null;
  place.externalPriceLevel = null;
  place.externalLatitude = null;
  place.externalLongitude = null;
  place.externalBusinessStatus = null;
  place.externalFetchedAt = null;
  place.externalExpiresAt = null;
}

/**
 * Brings an activity-place link's effective coordinates in line with its
 * place: owned coordinates when the place has them, otherwise a copy of the
 * place's temporary cache with the same expiry (or nothing). Returns whether
 * the link changed. Coordinates an administrator typed on the link itself
 * (`OWNED` on the link while the place has none) are kept.
 */
export function syncLinkCoordinates(
  link: ActivityPlace,
  place: Place,
): boolean {
  const before = [
    link.latitude,
    link.longitude,
    link.coordinatesSource,
    link.externalExpiresAt?.getTime() ?? null,
  ].join('|');

  if (place.latitude !== null && place.longitude !== null) {
    link.latitude = place.latitude;
    link.longitude = place.longitude;
    link.coordinatesSource = 'OWNED';
    link.externalFetchedAt = null;
    link.externalExpiresAt = null;
  } else if (
    link.coordinatesSource === 'OWNED' &&
    link.latitude !== null &&
    link.longitude !== null
  ) {
    // Owned at the link level: never replaced by provider content.
  } else if (
    place.externalLatitude !== null &&
    place.externalLongitude !== null
  ) {
    link.latitude = place.externalLatitude;
    link.longitude = place.externalLongitude;
    link.coordinatesSource = 'GOOGLE_CACHE';
    link.externalFetchedAt = place.externalFetchedAt;
    link.externalExpiresAt = place.externalExpiresAt;
  } else {
    link.latitude = null;
    link.longitude = null;
    link.coordinatesSource = null;
    link.externalFetchedAt = null;
    link.externalExpiresAt = null;
  }

  const after = [
    link.latitude,
    link.longitude,
    link.coordinatesSource,
    link.externalExpiresAt?.getTime() ?? null,
  ].join('|');
  return before !== after;
}

/** Whether a place's temporary cache is missing or past its expiry. */
export function isProviderCacheStale(
  row: Pick<Place, 'externalExpiresAt'>,
  now: Date,
): boolean {
  return (
    row.externalExpiresAt === null ||
    row.externalExpiresAt === undefined ||
    row.externalExpiresAt.getTime() < now.getTime()
  );
}
