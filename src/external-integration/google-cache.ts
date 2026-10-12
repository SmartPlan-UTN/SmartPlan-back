import type { ActivityPlace } from '../activities/entities/activity-place.entity';
import type { ResolvedPlaceDto } from './google-maps/dto/resolved-place.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single place that decides how provider (Google) content lands in the
 * TEMPORARY cache of an `activity_place`, shared by the nightly sync and the
 * on-demand refresh so both obey the same rules:
 *
 * - coordinates are cached only when SmartPlan does not own them, stamped
 *   `GOOGLE_CACHE`, and never replace owned coordinates;
 * - everything carries one expiry (`ttlDays`, at most 30);
 * - the place-level price range/level is cached, never converted or promoted
 *   to the activity's own price.
 */
export function applyProviderContent(
  row: ActivityPlace,
  result: ResolvedPlaceDto,
  now: Date,
  ttlDays: number,
): void {
  const hasOwnedCoordinates =
    row.latitude !== null &&
    row.longitude !== null &&
    row.coordinatesSource !== 'GOOGLE_CACHE';

  if (!hasOwnedCoordinates) {
    row.latitude = result.latitude;
    row.longitude = result.longitude;
    row.coordinatesSource = 'GOOGLE_CACHE';
  }

  if (result.rating === undefined || result.ratingCount === undefined) {
    row.externalRating = null;
    row.externalRatingCount = null;
  } else {
    row.externalRating = result.rating;
    row.externalRatingCount = result.ratingCount;
  }

  row.externalPriceMin = result.priceRange?.min ?? null;
  row.externalPriceMax = result.priceRange?.max ?? null;
  row.externalPriceCurrency = result.priceRange?.currency ?? null;
  row.externalPriceLevel = result.priceLevel ?? null;

  row.externalFetchedAt = now;
  row.externalExpiresAt = new Date(
    now.getTime() + Math.min(30, Math.max(1, ttlDays)) * DAY_MS,
  );
}

/** The provider no longer has the place, or the cache expired. */
export function dropProviderContent(row: ActivityPlace): void {
  if (row.coordinatesSource === 'GOOGLE_CACHE') {
    row.latitude = null;
    row.longitude = null;
    row.coordinatesSource = null;
  }
  row.externalRating = null;
  row.externalRatingCount = null;
  row.externalPriceMin = null;
  row.externalPriceMax = null;
  row.externalPriceCurrency = null;
  row.externalPriceLevel = null;
  row.externalFetchedAt = null;
  row.externalExpiresAt = null;
}

/** Whether a link's temporary cache is missing or past its expiry. */
export function isProviderCacheStale(
  row: Pick<ActivityPlace, 'externalExpiresAt'>,
  now: Date,
): boolean {
  return (
    row.externalExpiresAt === null ||
    row.externalExpiresAt === undefined ||
    row.externalExpiresAt.getTime() < now.getTime()
  );
}
