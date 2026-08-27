import {
  PlanRecommendationDto,
  PlanRecommendationReason,
} from './dto/plan-recommendation.dto';
import { RECOMMENDATION_WEIGHTS } from './plan-recommendations.constants';
import { PlanSummaryRow } from './plan-summary.sql';

/**
 * Pure ranking for CU20/US19. All IO (loading the pool and the user's signals)
 * happens in the service; everything here is deterministic and unit-tested for
 * invariants rather than exact scores.
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
  'preferences',
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
  const categoryIds = row.categories.map((category) => category.id);
  const averageRating = Number(row.averageRating);
  const distanceKm = row.distanceKm === null ? null : Number(row.distanceKm);

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
      jaccard(categoryIds, signals.historyCategories),
    preferences:
      RECOMMENDATION_WEIGHTS.preferences *
      overlapRatio(categoryIds, signals.preferenceCategories),
    near_you: signals.hasLocation
      ? RECOMMENDATION_WEIGHTS.distance * proximity
      : 0,
    popular: RECOMMENDATION_WEIGHTS.rating * clamp01(averageRating / 5),
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
  // A candidate with no category/proximity signal is just "popular".
  if (best !== 'popular' && contributions[best] <= 0) return 'popular';
  return best;
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
    },
    canSelect: false,
  };
}

function jaccard(values: number[], reference: Set<number>): number {
  if (values.length === 0 || reference.size === 0) return 0;
  const unique = new Set(values);
  let intersection = 0;
  for (const value of unique) if (reference.has(value)) intersection += 1;
  const union = unique.size + reference.size - intersection;
  return union === 0 ? 0 : intersection / union;
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
