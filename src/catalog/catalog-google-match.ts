/**
 * Matching of catalog places against Google Places candidates.
 *
 * Pure and unit-tested. Google results are used only to DECIDE whether a
 * candidate is the same real place (identity) and whether it still operates;
 * the only value that may flow back into the catalog package is the Place ID.
 */

export interface MatchSubject {
  slug: string;
  name: string;
  address: string;
  department: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
}

export interface MatchCandidate {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  businessStatus?: string;
}

export type MatchStatus = 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED' | 'CLOSED';

export interface MatchDecision {
  status: MatchStatus;
  placeId: string | null;
  score: number;
  nameSimilarity: number;
  distanceMeters: number | null;
  reason: string;
}

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'e',
  'sa',
  's',
  'a',
  'srl',
  'bodega',
  'bodegas',
  'vinedos',
  'vinedo',
  'finca',
  'restaurante',
  'restaurant',
  'resto',
  'museo',
  'parque',
  'winery',
  'wines',
  'wine',
  'estate',
  'estates',
  'familia',
  'familiar',
]);

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/** Token overlap in [0,1] relative to the smaller token set (containment). */
export function nameSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.length === 0 || right.length === 0) {
    // Only generic words ("Bodega"): compare the raw normalized strings.
    return normalizeText(a) === normalizeText(b) ? 1 : 0;
  }
  const rightSet = new Set(right);
  const shared = left.filter((token) => rightSet.has(token)).length;
  return shared / Math.min(left.length, right.length);
}

export function distanceMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Roughly the province of Mendoza; a hit outside it is never accepted. */
const MENDOZA_BOX = { south: -37.6, north: -32.0, west: -70.6, east: -66.5 };

function inMendoza(latitude: number, longitude: number): boolean {
  return (
    latitude >= MENDOZA_BOX.south &&
    latitude <= MENDOZA_BOX.north &&
    longitude >= MENDOZA_BOX.west &&
    longitude <= MENDOZA_BOX.east
  );
}

const CLOSED = new Set(['CLOSED_PERMANENTLY']);

export function decideMatch(
  subject: MatchSubject,
  candidates: MatchCandidate[],
): MatchDecision {
  const scored = candidates
    .filter((c) => inMendoza(c.latitude, c.longitude))
    .map((candidate) => {
      const similarity = nameSimilarity(subject.name, candidate.name);
      const meters =
        subject.latitude !== null && subject.longitude !== null
          ? distanceMeters(
              subject.latitude,
              subject.longitude,
              candidate.latitude,
              candidate.longitude,
            )
          : null;
      let score = similarity;
      if (meters !== null) {
        if (meters <= 300) score += 0.3;
        else if (meters <= 1000) score += 0.1;
        else if (meters > 5000) score -= 0.5;
      }
      return { candidate, similarity, meters, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      status: 'UNMATCHED',
      placeId: null,
      score: 0,
      nameSimilarity: 0,
      distanceMeters: null,
      reason: 'no_candidates_in_mendoza',
    };
  }

  const best = scored[0];
  const second = scored[1];
  const base = {
    placeId: best.candidate.placeId,
    score: Math.round(best.score * 100) / 100,
    nameSimilarity: Math.round(best.similarity * 100) / 100,
    distanceMeters: best.meters === null ? null : Math.round(best.meters),
  };

  if (best.similarity < 0.5) {
    return {
      ...base,
      status: 'UNMATCHED',
      placeId: null,
      reason: 'name_does_not_match',
    };
  }
  if (CLOSED.has(best.candidate.businessStatus ?? '')) {
    return { ...base, status: 'CLOSED', reason: 'permanently_closed' };
  }
  if (best.meters !== null && best.meters > 5000) {
    return {
      ...base,
      status: 'AMBIGUOUS',
      reason: 'far_from_owned_coordinates',
    };
  }
  const clearWinner =
    !second || best.score - second.score >= 0.25 || second.similarity < 0.5;
  if (best.similarity >= 0.75 && clearWinner) {
    return { ...base, status: 'MATCHED', reason: 'name_and_context' };
  }
  return {
    ...base,
    status: 'AMBIGUOUS',
    reason: clearWinner ? 'weak_name_match' : 'several_close_candidates',
  };
}
