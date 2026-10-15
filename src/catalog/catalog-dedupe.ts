/**
 * Duplicate detection for catalog places. Deliberately conservative: it flags
 * a candidate for human review instead of merging by itself.
 */

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'e',
  'en',
  'the',
  'of',
  'and',
]);

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .join(' ');
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Jaccard similarity of the normalised name tokens, 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const left = new Set(normalizeName(a).split(' ').filter(Boolean));
  const right = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Normalised name plus a ~100 m grid cell: a cheap indexed duplicate key. */
export function canonicalKey(
  name: string,
  latitude: number | null,
  longitude: number | null,
): string {
  const base = normalizeName(name).replace(/\s+/g, '-').slice(0, 150);
  if (latitude === null || longitude === null) return base;
  return `${base}@${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

export interface DuplicateSubject {
  slug: string;
  name: string;
  department: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId?: string | null;
}

export const DUPLICATE_DISTANCE_METERS = 150;
export const DUPLICATE_NAME_SIMILARITY = 0.8;

/**
 * Existing places that may be the same real place as `candidate`. A different
 * slug is required: the same slug is an update, not a duplicate.
 */
export function findDuplicateCandidates(
  candidate: DuplicateSubject,
  existing: readonly DuplicateSubject[],
): string[] {
  const found: string[] = [];
  for (const other of existing) {
    if (other.slug === candidate.slug) continue;

    if (
      candidate.googlePlaceId &&
      other.googlePlaceId &&
      candidate.googlePlaceId === other.googlePlaceId
    ) {
      found.push(other.slug);
      continue;
    }

    if (
      nameSimilarity(candidate.name, other.name) < DUPLICATE_NAME_SIMILARITY
    ) {
      continue;
    }

    const bothLocated =
      candidate.latitude !== null &&
      candidate.longitude !== null &&
      other.latitude !== null &&
      other.longitude !== null;
    if (bothLocated) {
      const meters = distanceMeters(
        {
          latitude: candidate.latitude as number,
          longitude: candidate.longitude as number,
        },
        {
          latitude: other.latitude as number,
          longitude: other.longitude as number,
        },
      );
      if (meters <= DUPLICATE_DISTANCE_METERS) found.push(other.slug);
    } else if (
      normalizeName(candidate.department) === normalizeName(other.department)
    ) {
      // Same name in the same department and no position to tell them apart.
      found.push(other.slug);
    }
  }
  return found;
}
