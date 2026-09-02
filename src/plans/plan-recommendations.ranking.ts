import {
  PlanRecommendationDto,
  PlanRecommendationReason,
} from './dto/plan-recommendation.dto';
import {
  FEEDBACK_WEIGHTS,
  RECOMMENDATION_WEIGHTS,
} from './plan-recommendations.constants';
import {
  FeedbackProfile,
  NEUTRAL_FEEDBACK_PROFILE,
} from './recommendation-feedback-profile';
import { PlanSummaryRow } from './plan-summary.sql';

/**
 * Pure ranking for CU20/US19 (+ CU21 feedback signals). All IO (loading the
 * pool and the user's signals) happens in the service; everything here is
 * deterministic and unit-tested for invariants rather than exact scores.
 *
 * CU21 refines the order with the user's post-experience feedback, always
 * conservatively: category affinity is shrunk toward neutral by how little
 * feedback backs it, an explicit distance preference is never narrowed, and a
 * negative signal can lower a card but never picks its `reason`.
 */

export interface RecommendationSignals {
  /** Category ids from the caller's completed plans. */
  historyCategories: Set<number>;
  /** Category ids the caller saved as preferences. */
  preferenceCategories: Set<number>;
  /** Whether caller coordinates were supplied. */
  hasLocation: boolean;
  /** Distance radius in km; `null` when there is no location. */
  radiusKm: number | null;
  /** CU21 — feedback-derived signals; neutral when the user has no feedback. */
  feedbackProfile?: FeedbackProfile;
}

type ReasonContributions = Record<PlanRecommendationReason, number>;

interface ScoredCandidate {
  row: PlanSummaryRow;
  score: number;
  reason: PlanRecommendationReason;
}

// Tie-break order when two reasons contribute equally.
const REASON_PRIORITY: PlanRecommendationReason[] = [
  'history',
  'well_rated_by_you',
  'preferences',
  'within_budget',
  'near_you',
  'popular',
];

export function rankRecommendations(
  rows: PlanSummaryRow[],
  signals: RecommendationSignals,
): PlanRecommendationDto[] {
  return rows
    .map((row) => scoreCandidate(row, signals))
    .sort(compareCandidates)
    .map(toRecommendation);
}

function scoreCandidate(
  row: PlanSummaryRow,
  signals: RecommendationSignals,
): ScoredCandidate {
  const feedback = signals.feedbackProfile ?? NEUTRAL_FEEDBACK_PROFILE;
  const categoryIds = row.categories.map((category) => category.id);
  const averageRating = Number(row.averageRating);
  const distanceKm = row.distanceKm === null ? null : Number(row.distanceKm);
  const estimatedCost = Number(row.estimatedTotalCost);

  const proximity =
    signals.hasLocation &&
    signals.radiusKm !== null &&
    signals.radiusKm > 0 &&
    distanceKm !== null
      ? 1 - clamp01(distanceKm / signals.radiusKm)
      : 0;

  const contributions: ReasonContributions = {
    history:
      RECOMMENDATION_WEIGHTS.history *
      weightedJaccard(
        categoryIds,
        signals.historyCategories,
        feedback.categoryAffinity,
      ),
    preferences:
      RECOMMENDATION_WEIGHTS.preferences *
      overlapRatio(categoryIds, signals.preferenceCategories),
    near_you: signals.hasLocation ? distanceWeight(feedback) * proximity : 0,
    popular: RECOMMENDATION_WEIGHTS.rating * clamp01(averageRating / 5),
    within_budget: budgetContribution(estimatedCost, feedback),
    well_rated_by_you:
      FEEDBACK_WEIGHTS.reinforce *
      overlapRatio(categoryIds, feedback.reinforcedCategories),
  };

  const score = REASON_PRIORITY.reduce(
    (sum, reason) => sum + contributions[reason],
    0,
  );

  return { row, score, reason: pickReason(contributions) };
}

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  const ratingA = Number(a.row.averageRating);
  const ratingB = Number(b.row.averageRating);
  if (ratingB !== ratingA) return ratingB - ratingA;
  return Number(a.row.id) - Number(b.row.id);
}

/** Dominant contribution; ties resolve by {@link REASON_PRIORITY}. */
function pickReason(
  contributions: ReasonContributions,
): PlanRecommendationReason {
  let best: PlanRecommendationReason = 'popular';
  let bestValue = -Infinity;
  for (const reason of REASON_PRIORITY) {
    if (contributions[reason] > bestValue) {
      bestValue = contributions[reason];
      best = reason;
    }
  }
  // A candidate with no positive personal signal is just "popular" — this also
  // keeps a negative feedback term from ever being surfaced as a reason.
  if (best !== 'popular' && contributions[best] <= 0) return 'popular';
  return best;
}

/**
 * Distance weight, nudged up (never the radius) when the user keeps tagging
 * plans `far`. An explicit `maxDistanceKm` preference is honoured elsewhere and
 * untouched here.
 */
function distanceWeight(feedback: FeedbackProfile): number {
  const { distanceSensitivity } = feedback;
  const threshold = FEEDBACK_WEIGHTS.distanceSensitivityThreshold;
  if (distanceSensitivity < threshold) return RECOMMENDATION_WEIGHTS.distance;
  const t = clamp01((distanceSensitivity - threshold) / (1 - threshold));
  return (
    RECOMMENDATION_WEIGHTS.distance +
    t * (FEEDBACK_WEIGHTS.distanceMax - RECOMMENDATION_WEIGHTS.distance)
  );
}

/**
 * Signed budget term. Positive when the candidate's expected real cost fits how
 * the user usually spends, negative when it overshoots. Zero unless the user
 * looks cost-sensitive and we have a spend reference.
 */
function budgetContribution(
  estimatedCost: number,
  feedback: FeedbackProfile,
): number {
  const ref = feedback.referenceCost;
  if (
    feedback.costSensitivity <= 0 ||
    ref === null ||
    ref <= 0 ||
    !Number.isFinite(estimatedCost) ||
    estimatedCost <= 0
  ) {
    return 0;
  }
  const expected = estimatedCost * (feedback.typicalSpendRatio ?? 1);
  const raw = 1 - expected / ref;
  return raw >= 0
    ? FEEDBACK_WEIGHTS.budget * feedback.costSensitivity * Math.min(raw, 1)
    : FEEDBACK_WEIGHTS.overBudget *
        feedback.costSensitivity *
        Math.max(raw, -1);
}

function toRecommendation(candidate: ScoredCandidate): PlanRecommendationDto {
  const { row } = candidate;
  return {
    reason: candidate.reason,
    plan: {
      id: Number(row.id),
      title: row.title,
      description: row.description,
      estimatedTotalCost: Number(row.estimatedTotalCost),
      estimatedTotalDuration: Number(row.estimatedTotalDuration),
      activityCount: row.activityNames.length,
      averageRating: round(Number(row.averageRating)),
      distanceKm:
        row.distanceKm === null ? null : round(Number(row.distanceKm)),
      imageUrl: row.imageUrl,
      categories: row.categories,
      activityNames: row.activityNames,
      status: { key: row.statusKey, name: row.statusName },
      viewerPlanState: row.viewerPlanState ?? 'view-only',
    },
    canSelect: false,
  };
}

/**
 * Jaccard overlap where each shared category counts as its feedback affinity
 * multiplier (`1` when the user has no feedback for it) instead of a flat `1`.
 * With no affinities this is exactly the CU20 Jaccard.
 */
function weightedJaccard(
  values: number[],
  reference: Set<number>,
  affinity: Map<number, number>,
): number {
  if (values.length === 0 || reference.size === 0) return 0;
  const unique = new Set(values);
  let intersectionCount = 0;
  let intersectionWeight = 0;
  for (const value of unique) {
    if (reference.has(value)) {
      intersectionCount += 1;
      intersectionWeight += affinity.get(value) ?? 1;
    }
  }
  const union = unique.size + reference.size - intersectionCount;
  return union === 0 ? 0 : intersectionWeight / union;
}

/** Share of the candidate's categories that are in the reference set. */
function overlapRatio(values: number[], reference: Set<number>): number {
  if (values.length === 0 || reference.size === 0) return 0;
  const unique = new Set(values);
  let intersection = 0;
  for (const value of unique) if (reference.has(value)) intersection += 1;
  return intersection / unique.size;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
