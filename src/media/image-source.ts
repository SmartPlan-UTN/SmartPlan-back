/**
 * Where a listing's `imageUrl` comes from (#102): an image someone uploaded,
 * or a Google Places photo that the client must attribute to Google Maps.
 */
export type ImageSource = 'uploaded' | 'google_maps';

const PLACE_PHOTO_URL = /^\/api\/activity-places\/\d+\/photo$/;

export function placePhotoUrl(activityPlaceId: number): string {
  return `/api/activity-places/${activityPlaceId}/photo`;
}

export function imageSourceOf(
  url: string | null | undefined,
): ImageSource | null {
  if (!url) {
    return null;
  }

  return PLACE_PHOTO_URL.test(url) ? 'google_maps' : 'uploaded';
}
