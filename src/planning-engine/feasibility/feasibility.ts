/**
 * Feasibility before ranking: a beautiful recommendation that cannot be
 * executed is a bad recommendation. Every candidate is judged here first,
 * and only FEASIBLE or UNCERTAIN candidates reach ranking. Reasons are kept
 * so the evaluation harness and the UI can say exactly why.
 */
import { priceConfidence } from '../../common/pricing/price';
import { hoursKnownFor } from '../candidate';
import type { PlanCandidate } from '../candidate';
import { evaluateHours, plausibleForKind } from '../hours/hours';
import type { PlanIntent } from '../intent/plan-intent';
import { partySize } from '../intent/plan-intent';
import { radiusForTolerance } from '../intent/build-intent';

export type FeasibilityVerdict = 'FEASIBLE' | 'UNCERTAIN' | 'INFEASIBLE';

export type FeasibilityReason =
  // hard
  | 'not_a_stop'
  | 'offering_required'
  | 'schedule_required'
  | 'closed_permanently'
  | 'closed_at_arrival'
  | 'closes_during_stop'
  | 'outside_typical_hours'
  | 'out_of_season'
  | 'party_size'
  | 'time_of_day_mismatch'
  | 'over_budget'
  | 'not_indoor'
  | 'not_free'
  | 'too_far'
  | 'not_kid_friendly'
  /** A kind of place the person explicitly refused ("pero no boliche"). */
  | 'excluded_by_user'
  // uncertain
  | 'hours_unknown'
  | 'price_unknown'
  | 'location_approximate'
  /** A specific service (brunch) the venue has not shown it offers. */
  | 'moment_unconfirmed';

const HARD: ReadonlySet<FeasibilityReason> = new Set([
  'not_a_stop',
  'offering_required',
  'schedule_required',
  'closed_permanently',
  'closed_at_arrival',
  'closes_during_stop',
  'outside_typical_hours',
  'out_of_season',
  'party_size',
  'time_of_day_mismatch',
  'over_budget',
  'not_indoor',
  'not_free',
  'too_far',
  'not_kid_friendly',
  'excluded_by_user',
]);

export interface Feasibility {
  verdict: FeasibilityVerdict;
  reasons: FeasibilityReason[];
}

function verdictOf(reasons: FeasibilityReason[]): Feasibility {
  if (reasons.some((reason) => HARD.has(reason)))
    return { verdict: 'INFEASIBLE', reasons };
  return { verdict: reasons.length ? 'UNCERTAIN' : 'FEASIBLE', reasons };
}

/** Group cost lower bound of a candidate, or null when unknown. */
export function candidateCostMin(
  candidate: PlanCandidate,
  people: number,
): number | null {
  const price = candidate.price;
  if (price.priceKind === 'UNKNOWN') return null;
  if (price.priceKind === 'FREE') return 0;
  const perPerson = ['PER_PERSON', 'ENTRY', 'CONSUMPTION'].includes(
    price.priceUnit ?? '',
  );
  return (price.priceMin ?? 0) * (perPerson ? Math.max(1, people) : 1);
}

const TRAIT_THRESHOLD = 0.3;

function traitScore(candidate: PlanCandidate, trait: string): number | null {
  const scores = candidate.traits.filter(
    (evidence) => evidence.trait === trait,
  );
  if (!scores.length) return null;
  return Math.max(...scores.map((evidence) => evidence.score));
}

/**
 * Static checks that do not depend on when the stop happens: can this be a
 * stop at all, for this group, this season, these constraints?
 */
export function staticFeasibility(
  candidate: PlanCandidate,
  intent: PlanIntent,
  month: number,
): Feasibility {
  const reasons: FeasibilityReason[] = [];
  if (candidate.kind === 'PLACE_ACTION') {
    if (candidate.stopPolicy === 'NOT_A_STOP') reasons.push('not_a_stop');
    if (candidate.stopPolicy === 'OFFERING_REQUIRED')
      reasons.push('offering_required');
    if (candidate.stopPolicy === 'SCHEDULE_REQUIRED')
      reasons.push('schedule_required');
  }
  // A verified OFFERING is always plannable, whoever provides it: the
  // offering is the experience (an agency's rafting trip is rafting).
  if (candidate.closedPermanently) reasons.push('closed_permanently');
  if (
    candidate.placeKind &&
    intent.excludedKinds?.includes(candidate.placeKind)
  )
    reasons.push('excluded_by_user');
  if (
    candidate.availableMonths?.length &&
    !candidate.availableMonths.includes(month)
  )
    reasons.push('out_of_season');
  const people = partySize(intent);
  if (
    (candidate.minPeople !== null && people < candidate.minPeople) ||
    (candidate.maxPeople !== null && people > candidate.maxPeople)
  )
    reasons.push('party_size');

  if (intent.constraints.indoorOnly) {
    const indoor = traitScore(candidate, 'indoor');
    const outdoor = traitScore(candidate, 'outdoor');
    if ((outdoor ?? 0) >= 0.5 && (indoor ?? 0) < 0.5)
      reasons.push('not_indoor');
  }
  if (intent.constraints.freeOnly && candidate.price.priceKind !== 'FREE')
    reasons.push('not_free');
  if (intent.constraints.kidFriendly) {
    const family = traitScore(candidate, 'family_friendly');
    if (family !== null && family <= -TRAIT_THRESHOLD)
      reasons.push('not_kid_friendly');
  }

  const cost = candidateCostMin(candidate, people);
  if (intent.budget?.strict && cost !== null && cost > intent.budget.amount)
    reasons.push('over_budget');
  if (
    candidate.price.priceKind === 'UNKNOWN' ||
    priceConfidence(candidate.price) === 'NONE'
  )
    reasons.push('price_unknown');

  // Inside a named region membership decides, not the distance to its centre.
  const radius =
    intent.location.radiusKm ??
    (intent.location.region
      ? Number.POSITIVE_INFINITY
      : radiusForTolerance(intent.location.travelTolerance));
  if (candidate.distanceKm !== null && candidate.distanceKm > radius)
    reasons.push('too_far');
  if (candidate.location === 'APPROXIMATE')
    reasons.push('location_approximate');

  return verdictOf(reasons);
}

/**
 * Timed checks for a stop placed at [start, end) on the plan's date: is the
 * place open (or at least plausibly open) for the whole visit?
 */
export function timedFeasibility(
  candidate: PlanCandidate,
  weekday: number,
  start: number,
  end: number,
): Feasibility {
  const reasons: FeasibilityReason[] = [];
  // A screening happens at its published time, and that is its schedule.
  if (candidate.fixedStart !== undefined) {
    if (start !== candidate.fixedStart) reasons.push('time_of_day_mismatch');
    return verdictOf(reasons);
  }
  if (candidate.hours && hoursKnownFor(candidate.hours, weekday, start)) {
    const status = evaluateHours(candidate.hours.weekly, weekday, start, end);
    if (status.status === 'CLOSED') reasons.push('closed_at_arrival');
    else if (status.status === 'CLOSES_DURING')
      reasons.push('closes_during_stop');
    return verdictOf(reasons);
  }
  // An offering with catalog times of day: those are maintained facts.
  if (candidate.kind === 'OFFERING' && candidate.availableTimesOfDay.length) {
    const period =
      start % 1440 < 12 * 60
        ? 'morning'
        : start % 1440 < 19 * 60
          ? 'afternoon'
          : start % 1440 < 23 * 60
            ? 'evening'
            : 'night';
    if (!candidate.availableTimesOfDay.includes(period))
      reasons.push('time_of_day_mismatch');
  }
  const plausible = plausibleForKind(candidate.placeKind, weekday, start, end);
  if (plausible === false && candidate.kind === 'PLACE_ACTION')
    reasons.push('outside_typical_hours');
  reasons.push('hours_unknown');
  return verdictOf(reasons);
}

export function combine(a: Feasibility, b: Feasibility): Feasibility {
  return verdictOf([...new Set([...a.reasons, ...b.reasons])]);
}

/** Spanish copy of the uncertainty a person should know about. */
export const UNCERTAINTY_COPY: Partial<Record<FeasibilityReason, string>> = {
  hours_unknown: 'Horario sin confirmar',
  price_unknown: 'Precio sin confirmar',
  location_approximate: 'Ubicación aproximada',
  moment_unconfirmed: 'Servicio sin confirmar',
};
