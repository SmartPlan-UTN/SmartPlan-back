/**
 * Everything the composer's assistant decides without a model. Gemini only
 * ever contributes semantic judgement (which activity fits the intent, why);
 * distances, durations, costs, limits and ordering arithmetic are computed
 * here from catalog data, and every id Gemini returns is resolved against the
 * real catalog before anything reaches the client.
 */

/**
 * The assistant does not suggest or propose additions that would take a route
 * past a full day. This is a heuristic of the assistant, not a domain rule:
 * the API accepts longer plans (whether a plan must fit in one day is an open
 * business decision, see docs/planning.md).
 */
const SUGGESTION_DAY_LIMIT_MINUTES = 24 * 60;

export interface CatalogActivity {
  id: number;
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  type: string | null;
  categories: Array<{ id: number; name: string }>;
  latitude: number | null;
  longitude: number | null;
}

export interface Point {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
/** "Cerca de" means this far at most, unless nothing else would be left. */
export const NEAR_RADIUS_KM = 15;
/** How many catalog rows are sent to the model as context. */
export const DIGEST_LIMIT = 80;
/** A category is "dominant" when it covers this share of a route. */
export const DOMINANT_SHARE = 0.6;
export const MAX_SEARCH_RESULTS = 8;
export const MAX_SUGGESTIONS = 4;
export const MAX_PROPOSALS = 3;

export function pointOf(activity: CatalogActivity): Point | null {
  return activity.latitude !== null && activity.longitude !== null
    ? { latitude: activity.latitude, longitude: activity.longitude }
    : null;
}

/** Straight-line distance in km (haversine). */
export function distanceKm(a: Point, b: Point): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function centroid(points: Point[]): Point | null {
  if (points.length === 0) return null;
  return {
    latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
    longitude: points.reduce((sum, p) => sum + p.longitude, 0) / points.length,
  };
}

/** Total km of a visiting order; `null` unless every stop has a position. */
export function routeKm(stops: CatalogActivity[]): number | null {
  const points = stops.map(pointOf);
  if (points.length < 2 || points.some((point) => point === null)) return null;
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += distanceKm(points[index - 1] as Point, points[index] as Point);
  }
  return total;
}

/**
 * The catalog rows worth showing the model: nearest to `anchor` first when
 * there is one, the rest in catalog order. Capped so the request stays small
 * and fast whatever the catalog size.
 */
export function selectDigest(
  rows: CatalogActivity[],
  anchor: Point | null,
  limit = DIGEST_LIMIT,
): CatalogActivity[] {
  if (!anchor) return rows.slice(0, limit);
  const withDistance = rows.map((row) => {
    const point = pointOf(row);
    return { row, km: point ? distanceKm(anchor, point) : Infinity };
  });
  withDistance.sort((a, b) => a.km - b.km || a.row.id - b.row.id);
  return withDistance.slice(0, limit).map((entry) => entry.row);
}

/** One line per activity: all the model needs to judge affinity, nothing it could misquote. */
export function digestLine(activity: CatalogActivity): string {
  const categories = activity.categories.map((c) => c.name).join('/');
  const description = activity.description.replace(/\s+/g, ' ').slice(0, 90);
  return `${activity.id} | ${activity.name} | ${categories || activity.type || '-'} | $${Math.round(activity.estimatedCost)} | ${activity.estimatedDuration} min | ${description}`;
}

export function routeLine(activity: CatalogActivity, index: number): string {
  const categories = activity.categories.map((c) => c.name).join('/');
  return `${index + 1}. ${activity.id} | ${activity.name} | ${categories || '-'} | ${activity.estimatedDuration} min`;
}

export function totalMinutes(stops: CatalogActivity[]): number {
  return stops.reduce((sum, stop) => sum + stop.estimatedDuration, 0);
}

/** A category covering at least `DOMINANT_SHARE` of a route of two or more stops. */
export function dominantCategory(
  stops: CatalogActivity[],
): { name: string; count: number } | null {
  if (stops.length < 2) return null;
  const counts = new Map<string, number>();
  for (const stop of stops) {
    for (const name of new Set(stop.categories.map((c) => c.name))) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) {
    if (count / stops.length >= DOMINANT_SHARE && (!best || count > best.count))
      best = { name, count };
  }
  return best;
}

/** Plain text from the model, bounded and free of control characters. */
export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f]+/g, ' ').trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

// ---------------------------------------------------------------- search

export interface SearchPick {
  activity: CatalogActivity;
  reason: string | null;
  distanceKm: number | null;
}

export interface ResolvedSearch {
  picks: SearchPick[];
  chips: string[];
  nearName: string | null;
  maxPrice: number | null;
}

/**
 * Turns the model's answer to "what does this query want?" into results that
 * are guaranteed real and consistent with what the catalog says: unknown ids
 * are dropped, a stated price ceiling is enforced against the real price, and
 * "near X" is enforced against real coordinates.
 */
export function resolveSearch(
  raw: unknown,
  digest: CatalogActivity[],
  route: CatalogActivity[],
): ResolvedSearch {
  const data = asObject(raw);
  const byId = new Map(digest.map((activity) => [activity.id, activity]));
  const known = new Map(
    [...digest, ...route].map((activity) => [activity.id, activity]),
  );

  const maxPrice =
    typeof data.maxPrice === 'number' &&
    Number.isFinite(data.maxPrice) &&
    data.maxPrice >= 0
      ? data.maxPrice
      : null;
  const nearId = asInt(data.nearActivityId);
  const reference = nearId !== null ? (known.get(nearId) ?? null) : null;
  const referencePoint = reference ? pointOf(reference) : null;

  const seen = new Set<number>();
  let picks: SearchPick[] = [];
  for (const item of asArray(data.results)) {
    const entry = asObject(item);
    const id = asInt(entry.id);
    const activity = id !== null ? byId.get(id) : undefined;
    if (!activity || seen.has(activity.id)) continue;
    seen.add(activity.id);
    if (maxPrice !== null && activity.estimatedCost > maxPrice) continue;
    const point = pointOf(activity);
    picks.push({
      activity,
      reason: cleanText(entry.reason, 90),
      distanceKm:
        referencePoint && point
          ? Math.round(distanceKm(referencePoint, point) * 10) / 10
          : null,
    });
  }

  if (referencePoint) {
    const near = picks.filter(
      (pick) => pick.distanceKm !== null && pick.distanceKm <= NEAR_RADIUS_KM,
    );
    if (near.length > 0) picks = near;
  }
  picks = picks.slice(0, MAX_SEARCH_RESULTS);

  const chips: string[] = [];
  if (maxPrice !== null) {
    chips.push(`Hasta $${Math.round(maxPrice).toLocaleString('es-AR')}`);
  }
  const near = reference && referencePoint;
  if (near) chips.push(`Cerca de ${cleanText(reference.name, 30)}`);
  for (const tag of asArray(data.tags).slice(0, 3)) {
    const text = cleanText(tag, 24);
    // "Cerca del museo" repeats the chip that was just derived from real data.
    if (
      !text ||
      chips.includes(text) ||
      (near && /^cerca(?![a-zñáéíóú])/i.test(text))
    )
      continue;
    chips.push(text);
  }

  return {
    picks,
    chips: chips.slice(0, 4),
    nearName: reference && referencePoint ? reference.name : null,
    maxPrice,
  };
}

// --------------------------------------------------------------- suggest

export interface SuggestPick {
  activity: CatalogActivity;
  reason: string | null;
}

export interface ResolvedSuggestions {
  picks: SuggestPick[];
  gap: { categoryName: string; message: string } | null;
}

export function resolveSuggestions(
  raw: unknown,
  pool: CatalogActivity[],
  route: CatalogActivity[],
): ResolvedSuggestions {
  const data = asObject(raw);
  const byId = new Map(pool.map((activity) => [activity.id, activity]));
  const used = totalMinutes(route);
  const seen = new Set<number>();
  const picks: SuggestPick[] = [];
  for (const item of asArray(data.suggestions)) {
    const entry = asObject(item);
    const id = asInt(entry.id);
    const activity = id !== null ? byId.get(id) : undefined;
    if (!activity || seen.has(activity.id)) continue;
    // Never suggest what would not fit in the same day.
    if (used + activity.estimatedDuration > SUGGESTION_DAY_LIMIT_MINUTES)
      continue;
    seen.add(activity.id);
    picks.push({ activity, reason: cleanText(entry.reason, 110) });
    if (picks.length === MAX_SUGGESTIONS) break;
  }

  const dominant = dominantCategory(route);
  const gapData = asObject(data.gap);
  const categoryName = cleanText(gapData.categoryName, 60);
  const catalogCategories = new Set(
    pool.flatMap((activity) => activity.categories.map((c) => c.name)),
  );
  const message = cleanText(gapData.message, 140);
  const gap =
    dominant &&
    categoryName &&
    message &&
    categoryName !== dominant.name &&
    catalogCategories.has(categoryName)
      ? { categoryName, message }
      : null;

  return { picks, gap };
}

// --------------------------------------------------------------- improve

export interface ProposalEffect {
  minutes: number;
  cost: number;
  /** Change in straight-line km; null when any position is unknown. */
  km: number | null;
}

export type Proposal =
  | {
      kind: 'reorder';
      reason: string;
      orderedActivityIds: number[];
      effect: ProposalEffect;
    }
  | {
      kind: 'add';
      reason: string;
      activity: CatalogActivity;
      /** Zero-based slot in the route; null appends. */
      position: number | null;
      effect: ProposalEffect;
    }
  | {
      kind: 'remove';
      reason: string;
      activityId: number;
      effect: ProposalEffect;
    };

const MAX_KM_REGRESSION = 1.1;

/**
 * Keeps only improvements that are valid, real and not contradicted by the
 * numbers: a reorder must be a permutation of the route and must not make it
 * meaningfully longer; an addition must exist, be new and still fit in a day;
 * a removal must be a stop of the route. The effect of each is computed here.
 */
export function resolveProposals(
  raw: unknown,
  route: CatalogActivity[],
  pool: CatalogActivity[],
): Proposal[] {
  const data = asObject(raw);
  const routeById = new Map(route.map((stop) => [stop.id, stop]));
  const poolById = new Map(pool.map((activity) => [activity.id, activity]));
  const baseKm = routeKm(route);
  const baseMinutes = totalMinutes(route);
  const proposals: Proposal[] = [];
  const kinds = new Set<string>();

  for (const item of asArray(data.proposals)) {
    if (proposals.length === MAX_PROPOSALS) break;
    const entry = asObject(item);
    const reason = cleanText(entry.reason, 140);
    if (!reason) continue;
    const kind = entry.kind;
    if (typeof kind !== 'string' || kinds.has(kind)) continue;

    if (kind === 'reorder') {
      const ids = asArray(entry.orderedActivityIds).map(asInt);
      if (
        ids.length !== route.length ||
        ids.some((id) => id === null || !routeById.has(id)) ||
        new Set(ids).size !== route.length ||
        ids.every((id, index) => id === route[index].id)
      ) {
        continue;
      }
      const next = (ids as number[]).map((id) => routeById.get(id)!);
      const nextKm = routeKm(next);
      if (
        baseKm !== null &&
        nextKm !== null &&
        nextKm > baseKm * MAX_KM_REGRESSION
      )
        continue;
      proposals.push({
        kind,
        reason,
        orderedActivityIds: ids as number[],
        effect: {
          minutes: 0,
          cost: 0,
          km:
            baseKm !== null && nextKm !== null
              ? Math.round((nextKm - baseKm) * 10) / 10
              : null,
        },
      });
      kinds.add(kind);
    } else if (kind === 'add') {
      const id = asInt(entry.activityId);
      const activity = id !== null ? poolById.get(id) : undefined;
      if (!activity || routeById.has(activity.id)) continue;
      if (
        baseMinutes + activity.estimatedDuration >
        SUGGESTION_DAY_LIMIT_MINUTES
      )
        continue;
      const position = asInt(entry.position);
      const slot =
        position !== null && position >= 0 && position <= route.length
          ? position
          : null;
      const next = [...route];
      next.splice(slot ?? next.length, 0, activity);
      const nextKm = routeKm(next);
      proposals.push({
        kind,
        reason,
        activity,
        position: slot,
        effect: {
          minutes: activity.estimatedDuration,
          cost: activity.estimatedCost,
          km:
            baseKm !== null && nextKm !== null
              ? Math.round((nextKm - baseKm) * 10) / 10
              : null,
        },
      });
      kinds.add(kind);
    } else if (kind === 'remove') {
      const id = asInt(entry.activityId);
      const stop = id !== null ? routeById.get(id) : undefined;
      if (!stop || route.length < 2) continue;
      const next = route.filter((candidate) => candidate.id !== stop.id);
      const nextKm = routeKm(next);
      proposals.push({
        kind,
        reason,
        activityId: stop.id,
        effect: {
          minutes: -stop.estimatedDuration,
          cost: -stop.estimatedCost,
          km:
            baseKm !== null && nextKm !== null
              ? Math.round((nextKm - baseKm) * 10) / 10
              : null,
        },
      });
      kinds.add(kind);
    }
  }
  return proposals;
}
