import type { PlanCandidate } from './candidate';
import { isPriceStale, UNKNOWN_PRICE } from '../common/pricing/price';
import {
  candidateCostMin,
  staticFeasibility,
  timedFeasibility,
} from './feasibility/feasibility';
import { EXPERIENCES, type ExperienceKey } from './intent/experiences';
import { partySize, type PlanIntent } from './intent/plan-intent';
import {
  rankCandidate,
  satisfiedExperience,
  type PersonalSignals,
  type RankedCandidate,
} from './ranking/ranking';
import { EMPTY_PERSONAL_SIGNALS } from './ranking/ranking';
import { buildPlanShape } from './shape/plan-shape';
import { haversineKm, legMinutes } from './solver/solver';
import { weekdayOf } from './time';

export interface CommunityItineraryStop {
  idActivity: number | null;
  idPlace: number | null;
  action: string | null;
  order: number;
  startMinute?: number | null;
}

export interface CommunityItineraryEvaluation {
  eligible: boolean;
  score: number;
  relevance: number;
  decisionGrade: boolean;
  budgetStatus: 'WITHIN' | 'UNCERTAIN' | 'EXCEEDS' | 'NO_BUDGET';
  totalMin: number | null;
  totalMax: number | null;
  totalDuration: number;
  travelMinutes: number;
  stops: { candidate: PlanCandidate; start: number; end: number }[];
  matchReasons: string[];
  uncertainties: string[];
}

const EXPERIENCE_KEYS = Object.keys(EXPERIENCES) as ExperienceKey[];
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function matchesStop(
  candidate: PlanCandidate,
  stop: CommunityItineraryStop,
): boolean {
  if (stop.idActivity !== null && candidate.activityId !== stop.idActivity)
    return false;
  if (stop.idPlace !== null && candidate.placeId !== stop.idPlace) return false;
  if (
    stop.idActivity === null &&
    stop.idPlace !== null &&
    stop.action &&
    candidate.action !== stop.action
  )
    return false;
  return stop.idActivity !== null || stop.idPlace !== null;
}

function experienceFor(
  candidate: PlanCandidate,
  intent: PlanIntent,
): ExperienceKey | null {
  const requested = intent.experiences.map(({ key }) => key);
  // A community itinerary can include a useful complementary stop that was
  // not named in the request (for example, a café after a walk). Keep that
  // stop in the itinerary and score it by what it actually offers instead of
  // rejecting the entire plan for not matching every stop to the same ask.
  return (
    (requested.length ? satisfiedExperience(candidate, requested) : null) ??
    satisfiedExperience(candidate, EXPERIENCE_KEYS)
  );
}

function requestedExperienceFor(
  candidate: PlanCandidate,
  intent: PlanIntent,
): ExperienceKey | null {
  return satisfiedExperience(
    candidate,
    intent.experiences.map(({ key }) => key),
  );
}

function priceMax(candidate: PlanCandidate, people: number): number | null {
  const price = candidate.price;
  if (price.priceKind === 'UNKNOWN') return null;
  if (price.priceKind === 'FREE') return 0;
  const amount =
    price.priceMax ?? (price.priceKind === 'FIXED' ? price.priceMin : null);
  if (amount === null) return null;
  return ['PER_PERSON', 'ENTRY', 'CONSUMPTION'].includes(price.priceUnit ?? '')
    ? amount * people
    : amount;
}

/**
 * Re-scores a published itinerary in its authored order against today's
 * catalog evidence and the current request. Saved plan price snapshots and
 * saved timings are deliberately not inputs.
 */
export function evaluateCommunityItinerary(input: {
  stops: CommunityItineraryStop[];
  candidates: PlanCandidate[];
  intent: PlanIntent;
  requestedAt: Date;
  personal?: PersonalSignals;
  useSavedStartTimes?: boolean;
}): CommunityItineraryEvaluation {
  const { stops, candidates, intent, requestedAt } = input;
  const personal = input.personal ?? EMPTY_PERSONAL_SIGNALS;
  const ordered = [...stops].sort((a, b) => a.order - b.order);
  const shape = buildPlanShape(intent, requestedAt);
  const weekday = weekdayOf(intent.when.date);
  const month = Number(intent.when.date.slice(5, 7));
  const required = intent.experiences.filter(
    (experience) => experience.required,
  );
  const covered = new Set<ExperienceKey>();
  const chosen: {
    candidate: PlanCandidate;
    start: number;
    end: number;
    ranked: RankedCandidate;
  }[] = [];
  const uncertainties = new Set<string>();
  let score = 0;
  let requestedIntentFit = 0;
  let requestedStopCount = 0;
  let knownMin = 0;
  let knownMax = 0;
  let hasUnknownPrice = false;
  let cursor = intent.when.startMinutes ?? shape.anchorPreferredStart;
  let travelMinutes = 0;
  let previous: PlanCandidate | null = null;

  for (const stop of ordered) {
    const options = candidates
      .filter((candidate) => matchesStop(candidate, stop))
      .map((candidate) =>
        isPriceStale(candidate.price, requestedAt)
          ? { ...candidate, price: { ...UNKNOWN_PRICE }, menuEvidence: [] }
          : candidate,
      );
    const feasible = options.filter(
      (candidate) =>
        staticFeasibility(candidate, intent, month).verdict !== 'INFEASIBLE',
    );
    if (!feasible.length) return ineligibleCommunityPlan();

    const startAt = (candidate: PlanCandidate) => {
      if (input.useSavedStartTimes && stop.startMinute != null)
        return stop.startMinute;
      if (!previous) return cursor;
      const km = haversineKm(previous, candidate);
      return cursor + legMinutes(km, intent.location.travelMode);
    };
    const ranked = feasible
      .map((candidate) => {
        const experience = experienceFor(candidate, intent);
        const start = startAt(candidate);
        const end = start + Math.max(1, candidate.durationMinutes);
        const staticResult = staticFeasibility(candidate, intent, month);
        const timed = timedFeasibility(candidate, weekday, start, end);
        if (timed.verdict === 'INFEASIBLE') return null;
        const feasibility = {
          verdict:
            staticResult.verdict === 'UNCERTAIN' ||
            timed.verdict === 'UNCERTAIN'
              ? ('UNCERTAIN' as const)
              : ('FEASIBLE' as const),
          reasons: [...new Set([...staticResult.reasons, ...timed.reasons])],
        };
        if (feasibility.verdict === 'UNCERTAIN')
          for (const reason of feasibility.reasons) uncertainties.add(reason);
        const value = rankCandidate(
          candidate,
          feasibility,
          experience ? [experience] : EXPERIENCE_KEYS,
          intent,
          personal,
          0,
        );
        if (!value) return null;
        return {
          candidate,
          start,
          end,
          ranked: value,
          km: previous ? haversineKm(previous, candidate) : 0,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort(
        (a, b) =>
          (a.km ?? Infinity) - (b.km ?? Infinity) ||
          b.ranked.score - a.ranked.score ||
          a.candidate.key.localeCompare(b.candidate.key),
      );
    const best = ranked[0];
    if (!best) return ineligibleCommunityPlan();

    const km = previous ? haversineKm(previous, best.candidate) : null;
    const leg = km === null ? 0 : legMinutes(km, intent.location.travelMode);
    if (previous) travelMinutes += leg;
    if (km === null && previous) uncertainties.add('location_approximate');
    const start = previous ? cursor + leg : cursor;
    const end = start + Math.max(1, best.candidate.durationMinutes);
    const timed = timedFeasibility(best.candidate, weekday, start, end);
    if (timed.verdict === 'INFEASIBLE') return ineligibleCommunityPlan();
    if (timed.verdict === 'UNCERTAIN')
      for (const reason of timed.reasons) uncertainties.add(reason);
    const staticResult = staticFeasibility(best.candidate, intent, month);
    if (staticResult.verdict === 'INFEASIBLE') return ineligibleCommunityPlan();
    if (staticResult.verdict === 'UNCERTAIN')
      for (const reason of staticResult.reasons) uncertainties.add(reason);

    const matched = experienceFor(best.candidate, intent);
    if (matched) covered.add(matched);
    const max = priceMax(best.candidate, partySize(intent));
    const min = candidateCostMin(best.candidate, partySize(intent));
    if (min === null || max === null) {
      hasUnknownPrice = true;
      uncertainties.add('price_unknown');
    } else {
      knownMin += min;
      knownMax += max;
    }

    const requestedMatch = requestedExperienceFor(best.candidate, intent);
    if (requestedMatch) {
      requestedStopCount += 1;
      requestedIntentFit += best.ranked.components.intentFit;
    }
    const roleWeight = required.some(
      (experience) => experience.key === requestedMatch,
    )
      ? 1
      : requestedMatch
        ? 0.35
        : 0.15;
    score += best.ranked.score * roleWeight - leg * 0.0015;
    chosen.push({ candidate: best.candidate, start, end, ranked: best.ranked });
    previous = best.candidate;
    cursor = end;
  }

  if (required.some((experience) => !covered.has(experience.key)))
    return ineligibleCommunityPlan();
  if (intent.experiences.length > 0 && requestedStopCount === 0)
    return ineligibleCommunityPlan();
  const duration = chosen.length
    ? chosen[chosen.length - 1].end - chosen[0].start
    : 0;
  if (intent.durationMinutes !== null && duration > intent.durationMinutes)
    return ineligibleCommunityPlan();

  const budgetStatus = !intent.budget
    ? 'NO_BUDGET'
    : knownMin > intent.budget.amount
      ? 'EXCEEDS'
      : hasUnknownPrice || knownMax > intent.budget.amount
        ? 'UNCERTAIN'
        : 'WITHIN';
  if (intent.budget?.strict && budgetStatus !== 'WITHIN')
    return ineligibleCommunityPlan();
  if (intent.budget && budgetStatus === 'WITHIN')
    score += intent.budget.strict ? 0.06 : 0.03;
  if (intent.budget && budgetStatus === 'UNCERTAIN')
    score -= intent.budget.strict ? 0.06 : 0.02;
  if (budgetStatus === 'EXCEEDS') return ineligibleCommunityPlan();

  const matchReasons: string[] = [];
  if (required.length) matchReasons.push('covers_experiences');
  const locationWasRequested = ['explicit', 'text', 'model'].includes(
    intent.provenance.location ?? 'default',
  );
  if (
    locationWasRequested &&
    (intent.location.idDepartment !== null ||
      intent.location.region !== null ||
      intent.location.latitude !== null)
  )
    matchReasons.push('fits_location');
  if (intent.budget && budgetStatus === 'WITHIN')
    matchReasons.push('fits_budget');
  if (intent.party.size > 1) matchReasons.push('fits_party');
  if (
    chosen.every(
      ({ candidate }) =>
        candidate.location !== 'APPROXIMATE' &&
        candidate.latitude !== null &&
        candidate.longitude !== null,
    )
  )
    matchReasons.push('route_has_known_locations');
  if (chosen.every(({ candidate }) => candidate.price.priceKind !== 'UNKNOWN'))
    matchReasons.push('prices_have_current_evidence');

  const decisionGrade =
    uncertainties.size === 0 && budgetStatus !== 'UNCERTAIN';
  // Complementary stops contribute to feasibility and value, but must not
  // dilute the relevance of the experience the person actually requested.
  const relevance =
    requestedStopCount > 0
      ? requestedIntentFit / requestedStopCount
      : chosen.reduce(
          (sum, stop) => sum + stop.ranked.components.intentFit,
          0,
        ) / Math.max(1, chosen.length);
  return {
    eligible: true,
    score: Math.round((score + 0.035 * clamp01(relevance)) * 10_000) / 10_000,
    relevance,
    decisionGrade,
    budgetStatus,
    totalMin: hasUnknownPrice ? null : knownMin,
    totalMax: hasUnknownPrice ? null : knownMax,
    totalDuration: duration,
    travelMinutes,
    stops: chosen,
    matchReasons,
    uncertainties: [...uncertainties],
  };
}

function ineligibleCommunityPlan(): CommunityItineraryEvaluation {
  return {
    eligible: false,
    score: Number.NEGATIVE_INFINITY,
    relevance: 0,
    decisionGrade: false,
    budgetStatus: 'UNCERTAIN',
    totalMin: null,
    totalMax: null,
    totalDuration: 0,
    travelMinutes: 0,
    stops: [],
    matchReasons: [],
    uncertainties: [],
  };
}
