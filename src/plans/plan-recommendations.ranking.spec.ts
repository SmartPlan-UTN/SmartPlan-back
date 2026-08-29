import { PlanSummaryRow } from './plan-summary.sql';
import {
  RecommendationSignals,
  rankRecommendations,
} from './plan-recommendations.ranking';

/**
 * Invariant tests for CU20 ranking. They assert *relationships* between
 * candidates (more affinity ranks higher, closer ranks higher, determinism),
 * never the concrete score, so tuning `RECOMMENDATION_WEIGHTS` does not break
 * them.
 */
function row(overrides: Partial<PlanSummaryRow> = {}): PlanSummaryRow {
  return {
    id: '1',
    title: 'Plan',
    description: null,
    estimatedTotalCost: '1000',
    estimatedTotalDuration: '60',
    averageRating: '0',
    distanceKm: null,
    imageUrl: null,
    categories: [],
    activityNames: ['Activity'],
    statusKey: 'completed',
    statusName: 'Completed',
    ...overrides,
  };
}

function signals(
  overrides: Partial<RecommendationSignals> = {},
): RecommendationSignals {
  return {
    historyCategories: new Set(),
    preferenceCategories: new Set(),
    hasLocation: false,
    radiusKm: null,
    ...overrides,
  };
}

const order = (result: { plan: { id: number } }[]) =>
  result.map((item) => item.plan.id);

describe('rankRecommendations (CU20/US19)', () => {
  it('ranks a plan matching the user history above an identical plan that does not', () => {
    const withAffinity = row({
      id: '2',
      categories: [{ id: 10, name: 'Wine' }],
    });
    const withoutAffinity = row({
      id: '1',
      categories: [{ id: 99, name: 'Sports' }],
    });

    const result = rankRecommendations(
      [withoutAffinity, withAffinity],
      signals({ historyCategories: new Set([10]) }),
    );

    expect(order(result)).toEqual([2, 1]);
  });

  it('ranks a plan matching the user preferences above one that does not', () => {
    const match = row({ id: '2', categories: [{ id: 5, name: 'Outdoors' }] });
    const noMatch = row({ id: '1', categories: [{ id: 8, name: 'Museums' }] });

    const result = rankRecommendations(
      [noMatch, match],
      signals({ preferenceCategories: new Set([5]) }),
    );

    expect(order(result)).toEqual([2, 1]);
  });

  it('ranks a closer plan above a farther identical plan when a location is given', () => {
    const near = row({ id: '2', distanceKm: '1' });
    const far = row({ id: '1', distanceKm: '9' });

    const result = rankRecommendations(
      [far, near],
      signals({ hasLocation: true, radiusKm: 10 }),
    );

    expect(order(result)).toEqual([2, 1]);
  });

  it('ignores distance entirely when no location is given', () => {
    const near = row({ id: '1', distanceKm: '1', averageRating: '2' });
    const farBetterRated = row({
      id: '2',
      distanceKm: '9',
      averageRating: '5',
    });

    const result = rankRecommendations([near, farBetterRated], signals());

    // Pure popularity: the better-rated plan wins despite being "farther".
    expect(order(result)).toEqual([2, 1]);
  });

  it('falls back to average rating, then id, with no personal signal', () => {
    const result = rankRecommendations(
      [
        row({ id: '1', averageRating: '3' }),
        row({ id: '2', averageRating: '5' }),
        row({ id: '3', averageRating: '5' }),
      ],
      signals(),
    );

    expect(order(result)).toEqual([2, 3, 1]);
  });

  it('is deterministic: same input, same order', () => {
    const rows = [
      row({ id: '1', averageRating: '4', categories: [{ id: 1, name: 'A' }] }),
      row({ id: '2', averageRating: '4', categories: [{ id: 2, name: 'B' }] }),
      row({ id: '3', averageRating: '2', categories: [{ id: 1, name: 'A' }] }),
    ];
    const sig = signals({ historyCategories: new Set([1]) });

    expect(order(rankRecommendations([...rows], sig))).toEqual(
      order(rankRecommendations([...rows].reverse(), sig)),
    );
  });

  describe('reason', () => {
    it('is "history" when history affinity dominates', () => {
      const [result] = rankRecommendations(
        [row({ categories: [{ id: 1, name: 'A' }] })],
        signals({ historyCategories: new Set([1]) }),
      );
      expect(result.reason).toBe('history');
    });

    it('is "preferences" when only preferences match', () => {
      const [result] = rankRecommendations(
        [row({ categories: [{ id: 1, name: 'A' }] })],
        signals({ preferenceCategories: new Set([1]) }),
      );
      expect(result.reason).toBe('preferences');
    });

    it('is "near_you" when proximity dominates', () => {
      const [result] = rankRecommendations(
        [row({ distanceKm: '0.1', averageRating: '1' })],
        signals({ hasLocation: true, radiusKm: 10 }),
      );
      expect(result.reason).toBe('near_you');
    });

    it('is "popular" when there is no personal signal', () => {
      const [result] = rankRecommendations(
        [row({ averageRating: '5' })],
        signals(),
      );
      expect(result.reason).toBe('popular');
    });
  });

  it('never marks a recommendation as selectable', () => {
    const result = rankRecommendations([row(), row({ id: '2' })], signals());
    expect(result.every((item) => item.canSelect === false)).toBe(true);
  });

  it('projects imageUrl straight through (null until a source exists)', () => {
    const [result] = rankRecommendations([row({ imageUrl: null })], signals());
    expect(result.plan.imageUrl).toBeNull();
  });
});
