import { FEEDBACK_WEIGHTS } from './plan-recommendations.constants';

/**
 * CU21 — the user's post-experience feedback (CU23) distilled into ranking
 * signals. Pure: the service runs one aggregate query and hands the raw rows
 * to {@link buildFeedbackProfile}; everything here is deterministic and
 * unit-tested.
 *
 * Only the user's own feedback on their own `completed` plans feeds this, and
 * only feedback that has not been rejected by moderation (CU59). Explicit
 * preferences (CU8/CU18) are a separate signal and never mixed in here.
 */

/** One row per `(feedback, category-touched-by-that-plan)`. */
export interface FeedbackProfileRow {
  feedbackId: number;
  rating: number;
  tags: string[];
  /** Real spend the user reported, `null` when they skipped it. */
  actualCost: number | null;
  /** What SmartPlan estimated the plan would cost. */
  estimatedTotalCost: number | null;
  idCategory: number | null;
}

export interface FeedbackProfile {
  /**
   * Per-category multiplier for the history term, `1` = neutral. Built from the
   * average rating the user gave plans in that category, shrunk toward neutral
   * by how few feedbacks back it (`n / (n + K)`).
   */
  categoryAffinity: Map<number, number>;
  /** Categories the user rated 4-5 or tagged `great_value` / `would_recommend`. */
  reinforcedCategories: Set<number>;
  /** 0..1 — how cost-sensitive the user looks (tag `too_expensive` + overspend). */
  costSensitivity: number;
  /** Median `actualCost / estimatedTotalCost`; `null` when never reported. */
  typicalSpendRatio: number | null;
  /** Median estimated cost of the user's completed plans; the budget reference. */
  referenceCost: number | null;
  /** 0..1 — how often the user tagged a plan `far`. */
  distanceSensitivity: number;
  /** Distinct feedbacks that fed this profile. */
  feedbackCount: number;
  /** `true` when at least one signal actually departs from neutral. */
  hasSignal: boolean;
}

export const NEUTRAL_FEEDBACK_PROFILE: FeedbackProfile = {
  categoryAffinity: new Map(),
  reinforcedCategories: new Set(),
  costSensitivity: 0,
  typicalSpendRatio: null,
  referenceCost: null,
  distanceSensitivity: 0,
  feedbackCount: 0,
  hasSignal: false,
};

interface FeedbackAggregate {
  rating: number;
  tags: Set<string>;
  actualCost: number | null;
  estimatedTotalCost: number | null;
  categories: Set<number>;
}

export function buildFeedbackProfile(
  rows: FeedbackProfileRow[],
): FeedbackProfile {
  if (rows.length === 0) return NEUTRAL_FEEDBACK_PROFILE;

  const feedbacks = new Map<number, FeedbackAggregate>();
  for (const row of rows) {
    let aggregate = feedbacks.get(row.feedbackId);
    if (!aggregate) {
      aggregate = {
        rating: row.rating,
        tags: new Set(row.tags ?? []),
        actualCost: row.actualCost,
        estimatedTotalCost: row.estimatedTotalCost,
        categories: new Set(),
      };
      feedbacks.set(row.feedbackId, aggregate);
    }
    if (row.idCategory !== null)
      aggregate.categories.add(Number(row.idCategory));
  }

  const feedbackCount = feedbacks.size;

  // Per-category rating samples.
  const categorySamples = new Map<number, number[]>();
  const reinforcedCategories = new Set<number>();
  let tooExpensiveCount = 0;
  let farCount = 0;
  const spendRatios: number[] = [];
  const referenceCosts: number[] = [];

  for (const aggregate of feedbacks.values()) {
    const endorsed =
      aggregate.rating >= 4 ||
      aggregate.tags.has('great_value') ||
      aggregate.tags.has('would_recommend');
    for (const category of aggregate.categories) {
      const samples = categorySamples.get(category) ?? [];
      samples.push(aggregate.rating);
      categorySamples.set(category, samples);
      if (endorsed) reinforcedCategories.add(category);
    }

    if (aggregate.tags.has('too_expensive')) tooExpensiveCount += 1;
    if (aggregate.tags.has('far')) farCount += 1;

    if (
      aggregate.actualCost !== null &&
      aggregate.estimatedTotalCost !== null &&
      aggregate.estimatedTotalCost > 0
    ) {
      spendRatios.push(aggregate.actualCost / aggregate.estimatedTotalCost);
    }
    if (
      aggregate.estimatedTotalCost !== null &&
      aggregate.estimatedTotalCost > 0
    ) {
      referenceCosts.push(aggregate.estimatedTotalCost);
    }
  }

  const categoryAffinity = new Map<number, number>();
  for (const [category, samples] of categorySamples) {
    const average = samples.reduce((sum, r) => sum + r, 0) / samples.length;
    const signal = (average - 3) / 2; // rating 3 -> 0, rating 5 -> +1, rating 1 -> -1
    const confidence =
      samples.length / (samples.length + FEEDBACK_WEIGHTS.affinityShrinkageK);
    const multiplier = clamp(
      1 + confidence * signal,
      FEEDBACK_WEIGHTS.affinityFloor,
      FEEDBACK_WEIGHTS.affinityCeil,
    );
    if (Math.abs(multiplier - 1) > 1e-6)
      categoryAffinity.set(category, multiplier);
  }

  const typicalSpendRatio = median(spendRatios);
  const tooExpensiveFreq = tooExpensiveCount / feedbackCount;
  const overspend =
    typicalSpendRatio !== null ? Math.max(0, typicalSpendRatio - 1) : 0;
  const costSensitivity = clamp01(tooExpensiveFreq + overspend);
  const distanceSensitivity = clamp01(farCount / feedbackCount);
  const referenceCost = median(referenceCosts);

  const hasSignal =
    categoryAffinity.size > 0 ||
    reinforcedCategories.size > 0 ||
    costSensitivity > 0 ||
    distanceSensitivity >= FEEDBACK_WEIGHTS.distanceSensitivityThreshold;

  return {
    categoryAffinity,
    reinforcedCategories,
    costSensitivity,
    typicalSpendRatio,
    referenceCost,
    distanceSensitivity,
    feedbackCount,
    hasSignal,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
