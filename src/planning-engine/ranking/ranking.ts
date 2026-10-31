/**
 * Ranking r1: explainable, versioned, and never one opaque score.
 *
 * Each candidate gets separate components in [0, 1] — how well it fits the
 * intent, its quality, how well it fits this person, the evidence behind
 * it, its value for the budget, the travel it costs and its novelty — and
 * an intent profile decides their weights. Quality is not fit: an excellent
 * place that is wrong for "cena romántica" loses to a very good one that is
 * right for it. Components are persisted with `RANKING_VERSION` so
 * recommendation quality can be compared across versions.
 */
import type { PlaceTrait } from '../../catalog/place-actionability';
import { priceConfidence } from '../../common/pricing/price';
import type { PlanCandidate } from '../candidate';
import type { Feasibility } from '../feasibility/feasibility';
import { candidateCostMin } from '../feasibility/feasibility';
import { EXPERIENCES, type ExperienceKey } from '../intent/experiences';
import type { PlanIntent } from '../intent/plan-intent';
import { partySize } from '../intent/plan-intent';
import { radiusForTolerance } from '../intent/build-intent';
import { traitValue } from '../traits/traits';
import { APPLY_CONFIDENCE } from '../intent/semantics';
import { normalizeSearchText } from '../../recommendation/local-intent';
import { hasUnconfirmedContext } from '../traits/context-evidence';
import { childrenOnly, occasionMatch } from '../occasions';

export const RANKING_VERSION = 'r4';

export interface RankingComponents {
  intentFit: number;
  quality: number;
  personalFit: number;
  evidence: number;
  value: number;
  travel: number;
  novelty: number;
  uncertainty: number;
}

export interface RankedCandidate {
  candidate: PlanCandidate;
  feasibility: Feasibility;
  components: RankingComponents;
  score: number;
  /** Which experience of the slot it satisfies. */
  experience: ExperienceKey;
}

/** What we know about this person, from their own history. */
export interface PersonalSignals {
  /** Affinity in [-1, 1] per place kind, from their rated outings. */
  kindAffinity: Map<string, number>;
  /** Places shown to them recently (novelty), with how many times. */
  recentlyShown: Map<number, number>;
  /** Places they already went to (completed outings). */
  visited: Set<number>;
  /** Places they skipped or reported as wrong (not suggested again soon). */
  avoided?: Set<number>;
}

export const EMPTY_PERSONAL_SIGNALS: PersonalSignals = {
  kindAffinity: new Map(),
  recentlyShown: new Map(),
  visited: new Set(),
};

type Weights = Record<keyof Omit<RankingComponents, 'uncertainty'>, number>;

const BASE_WEIGHTS: Weights = {
  intentFit: 0.36,
  quality: 0.18,
  personalFit: 0.06,
  evidence: 0.08,
  value: 0.1,
  travel: 0.14,
  novelty: 0.08,
};

/** Intent profile: which components matter more for this request. */
export function weightsFor(intent: PlanIntent): Weights {
  const weights = { ...BASE_WEIGHTS };
  if (intent.occasion === 'romantic' || intent.occasion === 'first_date') {
    weights.intentFit += 0.08;
    weights.travel -= 0.04;
    weights.value -= 0.04;
  }
  if (intent.pricePreference === 'cheap') {
    weights.value += 0.12;
    weights.quality -= 0.06;
    weights.intentFit -= 0.06;
  }
  if (intent.pricePreference === 'premium') {
    weights.quality += 0.08;
    weights.value -= 0.08;
  }
  if (intent.when.now) {
    weights.travel += 0.06;
    weights.evidence += 0.06;
    weights.intentFit -= 0.06;
    weights.novelty -= 0.06;
  }
  if (intent.location.travelTolerance === 'low') {
    weights.travel += 0.06;
    weights.quality -= 0.03;
    weights.novelty -= 0.03;
  }
  // A request with a character ("fachero", "tranqui", "para charlar") is
  // judged by how well a place has that character, more than by raw rating.
  const characterful = (intent.facets ?? []).some(
    (facet) =>
      facet.polarity === 'want' &&
      facet.confidence >= APPLY_CONFIDENCE &&
      ['style', 'energy', 'social', 'goal'].includes(facet.dimension),
  );
  if (characterful) {
    weights.intentFit += 0.08;
    weights.quality -= 0.05;
    weights.novelty -= 0.03;
  }
  if (intent.novelty === 'new') {
    weights.novelty += 0.08;
    weights.quality -= 0.04;
    weights.travel -= 0.04;
  }
  return weights;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** How well the candidate's traits match what the person asked for. */
function traitFit(
  candidate: PlanCandidate,
  wanted: PlaceTrait[],
  avoid: PlaceTrait[],
): number {
  if (!wanted.length && !avoid.length) return 0.5;
  let total = 0;
  for (const trait of wanted) {
    const { value, weight } = traitValue(candidate.traits, trait);
    // No evidence either way is neutral (0.45), slightly below a weak match.
    total += weight
      ? clamp01(0.5 + value * Math.min(1, weight / 0.5) * 0.5)
      : 0.45;
  }
  for (const trait of avoid) {
    const { value, weight } = traitValue(candidate.traits, trait);
    total += weight
      ? clamp01(0.5 - value * Math.min(1, weight / 0.5) * 0.5)
      : 0.5;
  }
  return total / (wanted.length + avoid.length);
}

/** Known lower-bound price per person, or null. */
function perPersonPrice(
  candidate: PlanCandidate,
  people: number,
): number | null {
  const price = candidate.price;
  if (price.priceKind === 'UNKNOWN' || price.priceMin === null) return null;
  if (price.priceKind === 'FREE') return 0;
  return ['PER_PERSON', 'ENTRY', 'CONSUMPTION'].includes(price.priceUnit ?? '')
    ? price.priceMin
    : price.priceMin / Math.max(1, people);
}

/**
 * "Barato" and "algo premium" are judged against what is known: a known
 * per-person price far from the wish is a poor fit; with no price, a trait
 * (premium / good value) may still speak for it.
 */
function pricePreferenceFit(
  candidate: PlanCandidate,
  intent: PlanIntent,
): number {
  if (!intent.pricePreference || intent.pricePreference === 'value') return 1;
  const price = perPersonPrice(candidate, partySize(intent));
  if (intent.pricePreference === 'premium') {
    const premium = traitValue(candidate.traits, 'premium');
    if (price !== null)
      return price >= 35000 ? 1.1 : price >= 20000 ? 0.9 : 0.55;
    return premium.weight && premium.value > 0.3
      ? 1
      : premium.value < -0.2
        ? 0.6
        : 0.85;
  }
  // cheap
  const value = traitValue(candidate.traits, 'good_value');
  if (price !== null) return price <= 15000 ? 1.1 : price <= 25000 ? 0.9 : 0.55;
  return value.weight && value.value > 0.3 ? 1 : 0.85;
}

/** The words a venue itself shows: its name, description and menu items. */
function ownWords(candidate: PlanCandidate): string {
  return normalizeSearchText(
    [
      candidate.placeName,
      candidate.name,
      candidate.description,
      ...candidate.menuEvidence.map((item) => item.name),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * What the crowd around a venue says about it, from counts that exist:
 * a "joyita escondida" is well rated by few people; an "iconic" place is
 * known by many. Neutral when there is no rating evidence.
 */
function renownSignal(candidate: PlanCandidate, intent: PlanIntent): number {
  const { rating, ratingCount } = candidate.quality;
  if (rating === null) return 0;
  const wants = (value: string) =>
    (intent.facets ?? []).some(
      (facet) =>
        facet.dimension === 'novelty' &&
        facet.value === value &&
        facet.polarity === 'want' &&
        facet.confidence >= APPLY_CONFIDENCE,
    );
  let signal = 0;
  if (wants('hidden_gem'))
    signal +=
      rating >= 4.2 && ratingCount <= 250
        ? 0.06
        : ratingCount > 1200
          ? -0.06
          : 0;
  if (wants('iconic') || wants('popular'))
    signal += ratingCount >= 800 ? 0.05 : ratingCount < 60 ? -0.04 : 0;
  return signal;
}

/** Which experience of a slot this candidate satisfies (best first). */
export function satisfiedExperience(
  candidate: PlanCandidate,
  experiences: ExperienceKey[],
): ExperienceKey | null {
  return (
    experiences.find((key) => {
      const experience = EXPERIENCES[key];
      if (!experience.actions.includes(candidate.action)) return false;
      // A lunch menu never fills a dinner, a brunch never a merienda.
      if (!experience.moment) return true;
      // An offering that never says which meal it is (a six-course pairing,
      // a tasting) cannot prove it is the lunch or brunch the person asked
      // for; a venue's intrinsic action states its own moments.
      if (candidate.moments === null) return candidate.kind !== 'OFFERING';
      return candidate.moments.includes(experience.moment);
    }) ?? null
  );
}

/** Meal moments that must be shown by the venue's own evidence. */
const PROOF_MOMENTS = new Set(['brunch']);

export function rankCandidate(
  candidate: PlanCandidate,
  feasibility: Feasibility,
  slotExperiences: ExperienceKey[],
  intent: PlanIntent,
  personal: PersonalSignals,
  maxTextScore: number,
): RankedCandidate | null {
  const experience = satisfiedExperience(candidate, slotExperiences);
  if (!experience) return null;
  const position = slotExperiences.indexOf(experience);

  // Intent fit: the right kind of experience, the right traits, the words.
  // A venue's secondary item (a restaurant's pint) is a weaker "tragos"
  // than a bar, unless its own evidence names this very moment (an official
  // "Brunch" at a restaurant is a real brunch).
  const moment = EXPERIENCES[experience].moment;
  const explicitForMoment =
    moment !== undefined &&
    candidate.menuEvidence.some((item) => item.moments?.includes(moment));
  // Some services are specific products, not a kind's default: a café is
  // not a brunch until its own source says so.
  const needsProof = moment !== undefined && PROOF_MOMENTS.has(moment);
  const proven =
    explicitForMoment ||
    (moment !== undefined && (candidate.servedMoments ?? []).includes(moment));
  const unproven = needsProof && !proven;
  const actionFit =
    (position === 0 ? 1 : Math.max(0.6, 1 - position * 0.15)) *
    (candidate.secondaryAction && !explicitForMoment ? 0.55 : 1) *
    (unproven ? 0.6 : 1);
  if (unproven)
    feasibility = {
      verdict:
        feasibility.verdict === 'INFEASIBLE' ? 'INFEASIBLE' : 'UNCERTAIN',
      reasons: [
        ...new Set([...feasibility.reasons, 'moment_unconfirmed' as const]),
      ],
    };
  const fit = traitFit(candidate, intent.vibe, intent.avoid);
  const text = maxTextScore > 0 ? candidate.textScore / maxTextScore : 0;
  // A live search for the person's own idea is an external relevance
  // signal (request-scoped), weighted like the words, never like evidence.
  const live = candidate.liveRelevance;
  // An offering made for who the plan is for, and its mood, ranks up.
  const intentFit = clamp01(
    (live === undefined
      ? actionFit * 0.45 + fit * 0.4 + text * 0.15
      : actionFit * 0.4 + fit * 0.35 + text * 0.1 + live * 0.15) *
      pricePreferenceFit(candidate, intent) +
      occasionMatch(candidate, intent) * 0.15 -
      // Games for children are not the default for a group of adults.
      (childrenOnly(candidate) && !intent.occasions?.includes('kids')
        ? 0.2
        : 0),
  );

  // Quality: Bayesian-smoothed rating; unknown is neutral, not bad.
  const { rating, ratingCount } = candidate.quality;
  const quality =
    rating === null
      ? 0.55
      : clamp01(
          ((rating * ratingCount + 3.8 * 8) / (ratingCount + 8) - 2.5) / 2.5,
        );

  // Personal fit: what this person liked before, by kind.
  const affinity = candidate.placeKind
    ? (personal.kindAffinity.get(candidate.placeKind) ?? 0)
    : 0;
  const personalFit = clamp01(0.5 + affinity * 0.5);

  // Evidence: how much of what we would claim is actually known.
  const priceKnown =
    candidate.price.priceKind === 'UNKNOWN'
      ? 0.35
      : priceConfidence(candidate.price) === 'HIGH'
        ? 1
        : 0.75;
  const locationKnown =
    candidate.location === 'OWNED' || candidate.location === 'HOME'
      ? 1
      : candidate.location === 'LIVE'
        ? 0.9
        : 0.4;
  const hoursKnown = candidate.hours ? 1 : 0.55;
  const evidence = clamp01((priceKnown + locationKnown + hoursKnown) / 3);

  // Value: cost against what the person wants to spend.
  const people = partySize(intent);
  const cost = candidateCostMin(candidate, people);
  let value = 0.5;
  if (cost !== null) {
    if (intent.budget) {
      const share = cost / Math.max(1, intent.budget.amount);
      value =
        intent.pricePreference === 'premium'
          ? clamp01(0.4 + share * 0.6)
          : clamp01(1 - share * 0.8);
    } else if (intent.pricePreference === 'cheap') {
      value = clamp01(1 - cost / people / 30000);
    } else if (intent.pricePreference === 'premium') {
      value = clamp01(cost / people / 60000);
    }
    // No budget and no price wish: a known price says nothing about value
    // (that it is known is credited once, in `evidence`).
  } else if (intent.budget || intent.pricePreference === 'cheap') {
    // An unknown price is never "cheap": it ranks below any known price
    // that fits (a known price at the whole budget still scores 0.2).
    value = 0.15;
  }

  // Travel: distance against the person's tolerance.
  const radius =
    intent.location.radiusKm ??
    radiusForTolerance(intent.location.travelTolerance);
  const travel =
    candidate.distanceKm === null
      ? 0.5
      : clamp01(1 - candidate.distanceKm / Math.max(1, radius));

  // Novelty: not what we showed them over and over, not where they went.
  const shown = personal.recentlyShown.get(candidate.placeId) ?? 0;
  const visited = personal.visited.has(candidate.placeId);
  const avoided = personal.avoided?.has(candidate.placeId) ?? false;
  const novelty = clamp01(
    1 -
      shown * 0.25 -
      (visited ? (intent.novelty === 'new' ? 0.8 : 0.3) : 0) -
      (avoided ? 1 : 0),
  );

  const uncertainty = feasibility.reasons.filter((reason) =>
    [
      'hours_unknown',
      'price_unknown',
      'location_approximate',
      'moment_unconfirmed',
    ].includes(reason),
  ).length;

  const weights = weightsFor(intent);
  const components: RankingComponents = {
    intentFit,
    quality,
    personalFit,
    evidence,
    value,
    travel,
    novelty,
    uncertainty,
  };
  const score =
    intentFit * weights.intentFit +
    quality * weights.quality +
    personalFit * weights.personalFit +
    evidence * weights.evidence +
    value * weights.value +
    travel * weights.travel +
    novelty * weights.novelty -
    uncertainty * 0.01 -
    // More complete operational data cannot make an unsubstantiated
    // atmosphere a stronger contextual match than documented alternatives.
    (hasUnconfirmedContext(intent, [candidate]) ? 0.2 : 0) -
    // A known price far from an explicit economic preference is a mismatch,
    // even when the venue's hours and menu happen to be unusually complete.
    (pricePreferenceFit(candidate, intent) <= 0.55 ? 0.15 : 0) -
    // Skipped or reported by this person: a strong, personal "not again".
    (avoided ? 0.15 : 0) -
    // A food the person is tired of ("otra hamburguesa") shown by the venue.
    (intent.avoidKeywords?.length &&
    intent.avoidKeywords.some((word) => ownWords(candidate).includes(word))
      ? 0.12
      : 0) +
    renownSignal(candidate, intent) -
    // Generic public spaces are connective tissue, not destinations.
    (candidate.connective &&
    !intent.experiences.some(({ key }) => key === 'walk')
      ? 0.08
      : 0);

  return {
    candidate,
    feasibility,
    components,
    score: Math.round(score * 10000) / 10000,
    experience,
  };
}
