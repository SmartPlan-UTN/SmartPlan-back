/**
 * Ranking constants for `GET /api/plan-recommendations` (CU20/US19).
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
