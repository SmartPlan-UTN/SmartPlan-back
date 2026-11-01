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

import {
  normalizeSearchText,
  parseSearch,
} from '../../activities/search-terms';
import { describePrice } from '../../common/pricing/price';
import type { PriceFields } from '../../common/pricing/price';

export interface CatalogActivity {
  id: number;
  name: string;
  description: string;
  /** Lower bound of the price; `null` when unknown (never read as free). */
  estimatedCost: number | null;
  price: PriceFields;
  /**
   * Trustworthy enough to be suggested without the person asking for it.
   * Missing means eligible (older fixtures and callers).
   */
  autoRecommend?: boolean;
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
/**
 * Suggestions and improvements only put title matches first within this
 * distance of the route: a plan downtown should not get wineries 200 km
 * away because the title says "vinos".
 */
export const INTENT_RADIUS_KM = 2 * NEAR_RADIUS_KM;
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

/** At most this share of the digest is spent on rows matching the intent. */
const INTENT_SHARE = 0.5;

export interface DigestOptions {
  /** What the person wrote (search sentence, or plan title and note). */
  intent?: string;
  /**
   * With a route, intent rows farther than this from its middle are left to
   * the nearest-first sample instead of jumping the queue (rows without a
   * position always qualify). Omit when the person names the place
   * themselves, as in search.
   */
  intentRadiusKm?: number;
  /** Injected for deterministic tests; defaults to `Math.random`. */
  random?: () => number;
}

/**
 * The catalog rows worth showing the model, capped so the request stays
 * small and fast whatever the catalog size. The model can only pick from
 * here, so the cap must not decide the answer:
 *
 *  1. Rows that match what the person wrote go first (up to half the cap):
 *     a title about board games must reach the model with the games in it.
 *  2. The rest is a spread sample. Near the route when it has positions,
 *     without crowding out rows that have none (games at home, ideas); with
 *     no route, a round robin across categories in random order. Taking
 *     the first rows by id instead always sent the same oldest restaurants,
 *     and the suggestions repeated them for every plan.
 */
export function selectDigest(
  rows: CatalogActivity[],
  anchor: Point | null,
  limit = DIGEST_LIMIT,
  options: DigestOptions = {},
): CatalogActivity[] {
  const random = options.random ?? Math.random;
  const picked = new Map<number, CatalogActivity>();
  const take = (row: CatalogActivity) => {
    if (picked.size < limit) picked.set(row.id, row);
  };

  for (const row of rankByIntent(
    rows,
    options.intent ?? '',
    anchor,
    options.intentRadiusKm,
  ).slice(0, Math.ceil(limit * INTENT_SHARE))) {
    take(row);
  }
  const rest = rows.filter((row) => !picked.has(row.id));
  for (const row of anchor
    ? nearestKeepingUnplaced(rest, anchor, random)
    : acrossCategories(rest, random)) {
    take(row);
  }
  return [...picked.values()];
}

/** Rows matching the intent's words (with search synonyms), best first. */
function rankByIntent(
  rows: CatalogActivity[],
  intent: string,
  anchor: Point | null,
  radiusKm?: number,
): CatalogActivity[] {
  const groups = parseSearch(intent).groups.filter(
    (group) => !group.cheapPrice && (group.terms.length || group.activityTypes),
  );
  if (groups.length === 0) return [];
  const patterns = groups.map((group) => ({
    words: group.terms.map(termPattern),
    types: group.activityTypes ?? [],
  }));

  return rows
    .map((row) => {
      const text = normalizeSearchText(
        [
          row.name,
          row.description,
          row.type ?? '',
          ...row.categories.map((c) => c.name),
        ].join(' '),
      );
      const score = patterns.filter(
        (group) =>
          group.types.includes(row.type ?? '') ||
          group.words.some((pattern) => pattern.test(text)),
      ).length;
      const point = pointOf(row);
      const km = anchor && point ? distanceKm(anchor, point) : Infinity;
      return { row, score, km };
    })
    .filter(
      (entry) =>
        entry.score > 0 &&
        (radiusKm === undefined ||
          entry.km === Infinity ||
          entry.km <= radiusKm),
    )
    .sort((a, b) => b.score - a.score || a.km - b.km || a.row.id - b.row.id)
    .map((entry) => entry.row);
}

/** A whole word, singular or plural ("juegos" also finds "juego"). */
function termPattern(term: string): RegExp {
  const stems = new Set([term]);
  if (term.length > 4 && term.endsWith('es')) stems.add(term.slice(0, -2));
  if (term.length > 3 && term.endsWith('s')) stems.add(term.slice(0, -1));
  const alternatives = [...stems].map((stem) =>
    stem.replace(/[^a-z0-9 ]/g, ''),
  );
  return new RegExp(`\\b(?:${alternatives.join('|')})(?:s|es)?\\b`);
}

/**
 * Nearest first, with rows that have no position (things to do at home)
 * interleaved in their share of the catalog instead of sorted last, where
 * the cap would always drop them.
 */
function nearestKeepingUnplaced(
  rows: CatalogActivity[],
  anchor: Point,
  random: () => number,
): CatalogActivity[] {
  const placed = rows
    .map((row) => ({ row, point: pointOf(row) }))
    .filter(
      (entry): entry is { row: CatalogActivity; point: Point } =>
        entry.point !== null,
    )
    .map((entry) => ({ row: entry.row, km: distanceKm(anchor, entry.point) }))
    .sort((a, b) => a.km - b.km || a.row.id - b.row.id)
    .map((entry) => entry.row);
  const unplaced = acrossCategories(
    rows.filter((row) => pointOf(row) === null),
    random,
  );
  return interleave(placed, unplaced);
}

/** Round robin across each row's first category, every group shuffled. */
function acrossCategories(
  rows: CatalogActivity[],
  random: () => number,
): CatalogActivity[] {
  const groups = new Map<string, CatalogActivity[]>();
  for (const row of rows) {
    const key = row.categories[0]?.name ?? row.type ?? '';
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const queues = shuffle([...groups.values()], random).map((group) =>
    shuffle(group, random),
  );
  const result: CatalogActivity[] = [];
  for (let round = 0; result.length < rows.length; round++) {
    for (const queue of queues) {
      if (round < queue.length) result.push(queue[round]);
    }
  }
  return result;
}

/** Both lists in order, each taking turns in proportion to its size. */
function interleave<T>(first: T[], second: T[]): T[] {
  const result: T[] = [];
  let i = 0;
  let j = 0;
  while (i < first.length || j < second.length) {
    const firstDue =
      j >= second.length ||
      (i < first.length && i * second.length <= j * first.length);
    result.push(firstDue ? first[i++] : second[j++]);
  }
  return result;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** One line per activity: all the model needs to judge affinity, nothing it could misquote. */
export function digestLine(activity: CatalogActivity): string {
  const categories = activity.categories.map((c) => c.name).join('/');
  const description = activity.description.replace(/\s+/g, ' ').slice(0, 90);
  return `${activity.id} | ${activity.name} | ${categories || activity.type || '-'} | ${describePrice(activity.price)} | ${activity.estimatedDuration} min | ${description}`;
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
    // An unknown price cannot be shown to fit a budget, so it never passes.
    if (
      maxPrice !== null &&
      (activity.estimatedCost === null || activity.estimatedCost > maxPrice)
    )
      continue;
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
  /** Known cost change; `null` when the activity's price is unknown. */
  cost: number | null;
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
          cost: stop.estimatedCost === null ? null : -stop.estimatedCost,
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
