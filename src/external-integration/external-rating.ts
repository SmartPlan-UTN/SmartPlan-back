import type { ExternalRatingDto } from '../activities/dto/activity-response.dto';

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
