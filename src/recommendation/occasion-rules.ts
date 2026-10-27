import {
  conflictingOccasions,
  isOccasion,
  isWhoOccasion,
  type Occasion,
} from '../catalog/taxonomy';

/**
 * How the virtual Hogar ("En casa / donde estén") enters a generated plan:
 *
 * - `only`: the user asked to stay home; every stop is at the Hogar.
 * - `allowed`: free plans or a low budget; the Hogar competes like any place.
 * - `filler`: a normal outing; at most one Hogar stop per plan (a closing or
 *   a filler) and at most {@link HOME_SHORTLIST_SLOTS} in the shortlist.
 */
export type HomeMode = 'only' | 'allowed' | 'filler';

/** Hogar candidates a `filler` shortlist keeps, so they never crowd it. */
export const HOME_SHORTLIST_SLOTS = 3;

/**
 * Budget per person (ARS) at or under which games at home join the regular
 * candidates. Calibrated with the evaluation set (scripts/evaluation).
 */
export const HOME_LOW_BUDGET_PER_PERSON_ARS = 6000;

export interface OccasionRules {
  /** Every requested occasion (who and mood), for ranking. */
  occasions: Occasion[];
  /** Who-occasions the request names: an activity must carry ALL of them. */
  required: Occasion[];
  /** Occasions that clash with the request. */
  conflicting: Occasion[];
  homeMode: HomeMode;
  /** Only evidenced FREE prices (UNKNOWN is never free). */
  freeOnly: boolean;
}

export function resolveHomeMode(input: {
  atHome?: boolean | null;
  freeOnly?: boolean | null;
  budget: number | null;
  partySize: number | null;
}): HomeMode {
  if (input.atHome) return 'only';
  if (input.freeOnly) return 'allowed';
  if (
    input.budget != null &&
    input.budget / Math.max(1, input.partySize ?? 1) <=
      HOME_LOW_BUDGET_PER_PERSON_ARS
  )
    return 'allowed';
  return 'filler';
}

export function occasionRules(input: {
  occasions?: readonly string[] | null;
  homeMode?: HomeMode | null;
  freeOnly?: boolean | null;
}): OccasionRules {
  const occasions = [...new Set(input.occasions ?? [])].filter(isOccasion);
  return {
    occasions,
    required: occasions.filter(isWhoOccasion),
    conflicting: conflictingOccasions(occasions),
    homeMode: input.homeMode ?? 'filler',
    freeOnly: Boolean(input.freeOnly),
  };
}

export interface OccasionCandidate {
  occasions?: readonly string[] | null;
  atHome?: boolean;
  price: { priceKind: string };
}

/**
 * Whether one activity may be offered for the request. A conflicting
 * occasion only excludes an activity that has none of the requested ones: a
 * park that suits a date and a birthday stays valid for a date.
 */
export function activityFitsOccasion(
  activity: OccasionCandidate,
  rules: OccasionRules,
): boolean {
  const tags = activity.occasions ?? [];
  if (!rules.required.every((occasion) => tags.includes(occasion)))
    return false;
  if (
    rules.conflicting.some((occasion) => tags.includes(occasion)) &&
    !rules.occasions.some((occasion) => tags.includes(occasion))
  )
    return false;
  if (rules.homeMode === 'only' && !activity.atHome) return false;
  if (rules.freeOnly && activity.price.priceKind !== 'FREE') return false;
  return true;
}

/**
 * The server-side check of a composed plan, the source of truth whatever
 * Gemini or the fallback returned: every stop fits the occasion and the
 * Hogar appears as the mode allows.
 */
export function planFitsOccasion(
  stops: OccasionCandidate[],
  rules: OccasionRules,
): boolean {
  if (!stops.every((stop) => activityFitsOccasion(stop, rules))) return false;
  const homeStops = stops.filter((stop) => stop.atHome).length;
  if (rules.homeMode === 'filler' && homeStops > 1) return false;
  return true;
}

/** SQL for {@link activityFitsOccasion} on `activity` / `place` rows. */
export function occasionFilterSql(
  rules: OccasionRules,
  activity = 'activity',
): { sql: string[]; params: Record<string, unknown> } {
  const sql: string[] = [];
  const params: Record<string, unknown> = {};
  if (rules.required.length) {
    sql.push(`${activity}.occasions @> ARRAY[:...requiredOccasions]::text[]`);
    params.requiredOccasions = rules.required;
  }
  if (rules.conflicting.length) {
    sql.push(
      `(NOT (${activity}.occasions && ARRAY[:...conflictingOccasions]::text[])` +
        (rules.occasions.length
          ? ` OR ${activity}.occasions && ARRAY[:...requestedOccasions]::text[])`
          : ')'),
    );
    params.conflictingOccasions = rules.conflicting;
    if (rules.occasions.length) params.requestedOccasions = rules.occasions;
  }
  if (rules.freeOnly) sql.push(`${activity}.price_kind = 'FREE'`);
  return { sql, params };
}
