/**
 * Ranking constants for `GET /api/plan-recommendations` (CU20/US19 + CU21).
 *
 * The ranking is a small, deterministic, additive heuristic — not a learned
 * model. These weights are deliberate starting points, tuned by feel, not
 * measured precision; the unit tests assert ranking *invariants* (more history
 * affinity ranks higher, closer ranks higher, …), never these numbers. Change
 * them here only.
 */
export const RECOMMENDATION_WEIGHTS = {
  /** Category overlap (Jaccard) with the user's completed-plan history. */
  history: 1,
  /** Category overlap with the user's saved category preferences. */
  preferences: 1,
  /** Average approved activity rating, normalised to 0..1. */
  rating: 0.5,
  /** Proximity: closer plans score higher. Only applied with coordinates. */
  distance: 0.5,
} as const;

/** Radius used when the request and the user's preference both omit one. */
export const DEFAULT_RECOMMENDATION_RADIUS_KM = 50;

/**
 * CU21 — how the user's post-experience feedback (CU23) nudges the ranking.
 * Every weight here is conservative on purpose: feedback refines the order, it
 * never dominates it, and a single bad outing must not bury a whole category.
 */
export const FEEDBACK_WEIGHTS = {
  /**
   * Shrinkage constant for per-category rating affinity: the confidence in a
   * category's signal is `n / (n + K)` where `n` is how many of the user's
   * feedbacks touched that category. With `K = 3`, one feedback carries ~25% of
   * its nominal pull, four carry ~57%, and it approaches full strength slowly.
   */
  affinityShrinkageK: 3,
  /** Lower / upper clamp for the final per-category affinity multiplier. */
  affinityFloor: 0.6,
  affinityCeil: 1.4,
  /**
   * Positive reinforcement for categories the user rated 4-5 or endorsed. Set
   * high enough to out-rank a plain history-category match: "you loved this"
   * is a stronger, more specific signal than "your history touches this", and
   * should win the card's `reason` when both apply.
   */
  reinforce: 0.9,
  /** Reward for a candidate whose expected real cost fits the user's budget. */
  budget: 0.4,
  /** Penalty for a candidate whose expected real cost overshoots the budget. */
  overBudget: 0.35,
  /**
   * When the user tags `far` at least this often, the distance weight is
   * interpolated toward {@link FEEDBACK_WEIGHTS.distanceMax}. The permitted
   * radius is never changed — an explicit `maxDistanceKm` preference wins.
   */
  distanceSensitivityThreshold: 0.4,
  distanceMax: 0.75,
  /** Expected real cost above `ref * this` counts as an overshoot. */
  overBudgetTolerance: 1.25,
} as const;
