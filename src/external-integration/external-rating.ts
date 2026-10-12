import type {
  ExternalPriceDto,
  ExternalRatingDto,
} from '../activities/dto/activity-response.dto';

/**
 * The Google rating a client may be shown, or `null`. It is a temporary
 * provider cache: past its expiry it must not be displayed even if the purge
 * has not run yet, and what is shown always says where it comes from so the
 * UI can attribute it.
 */
export function visibleExternalRating(
  link: {
    externalRating: number | null;
    externalRatingCount: number | null;
    externalExpiresAt: Date | null;
  },
  now: Date = new Date(),
): ExternalRatingDto | null {
  if (link.externalRating == null || link.externalRatingCount == null) {
    return null;
  }
  if (
    link.externalExpiresAt !== null &&
    link.externalExpiresAt !== undefined &&
    link.externalExpiresAt.getTime() < now.getTime()
  ) {
    return null;
  }
  return {
    rating: link.externalRating,
    ratingCount: link.externalRatingCount,
    source: 'google',
  };
}

/**
 * The place-level Google price estimate a client may be shown, or `null`.
 * Same cache rules as the rating: past its expiry it is never displayed. It is
 * context about the venue, so it is never treated as the activity's price.
 */
export function visibleExternalPrice(
  link: {
    externalPriceMin: number | null;
    externalPriceMax: number | null;
    externalPriceCurrency: string | null;
    externalPriceLevel: string | null;
    externalExpiresAt: Date | null;
  },
  now: Date = new Date(),
): ExternalPriceDto | null {
  const hasAmount =
    link.externalPriceMin != null || link.externalPriceMax != null;
  if (!hasAmount && !link.externalPriceLevel) return null;
  if (
    link.externalExpiresAt !== null &&
    link.externalExpiresAt !== undefined &&
    link.externalExpiresAt.getTime() < now.getTime()
  ) {
    return null;
  }
  return {
    min: link.externalPriceMin ?? null,
    max: link.externalPriceMax ?? null,
    currency: hasAmount ? (link.externalPriceCurrency ?? null) : null,
    level: link.externalPriceLevel ?? null,
    source: 'google',
  };
}
