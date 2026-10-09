import { PlanSummaryRow } from './plan-summary.sql';
import {
  RecommendationSignals,
  rankRecommendations,
} from './plan-recommendations.ranking';
import {
  buildFeedbackProfile,
  FeedbackProfileRow,
} from './recommendation-feedback-profile';

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

  describe('CU21 — feedback signals', () => {
    const fb = (
      overrides: Partial<FeedbackProfileRow>,
    ): FeedbackProfileRow => ({
      feedbackId: 1,
      rating: 3,
      tags: [],
      actualCost: null,
      estimatedTotalCost: null,
      idCategory: null,
      ...overrides,
    });

    it('leaves the order untouched when the user has no feedback', () => {
      const rows = [
        row({
          id: '1',
          averageRating: '4',
          categories: [{ id: 1, name: 'A' }],
        }),
        row({
          id: '2',
          averageRating: '4',
          categories: [{ id: 2, name: 'B' }],
        }),
        row({
          id: '3',
          averageRating: '2',
          categories: [{ id: 1, name: 'A' }],
        }),
      ];
      const base = signals({ historyCategories: new Set([1, 2]) });

      const withNeutral = order(
        rankRecommendations([...rows], {
          ...base,
          feedbackProfile: buildFeedbackProfile([]),
        }),
      );

      expect(withNeutral).toEqual(order(rankRecommendations([...rows], base)));
    });

    it('does not bury a category after a single bad experience', () => {
      // One rating-2 feedback on category 10; category 99 is not in history.
      const profile = buildFeedbackProfile([fb({ rating: 2, idCategory: 10 })]);
      const ratedOnceBadly = row({
        id: '1',
        categories: [{ id: 10, name: 'A' }],
      });
      const noHistoryMatch = row({
        id: '2',
        categories: [{ id: 99, name: 'Z' }],
      });

      const result = rankRecommendations([noHistoryMatch, ratedOnceBadly], {
        ...signals({ historyCategories: new Set([10]) }),
        feedbackProfile: profile,
      });

      // Still ranks above a plan the history does not match at all.
      expect(order(result)).toEqual([1, 2]);
    });

    it('ranks a consistently loved category above a consistently disliked one', () => {
      const loved = [10, 11, 12, 13].map((id) =>
        fb({ feedbackId: id, rating: 5, idCategory: 1 }),
      );
      const disliked = [20, 21, 22, 23].map((id) =>
        fb({ feedbackId: id, rating: 2, idCategory: 2 }),
      );
      const profile = buildFeedbackProfile([...loved, ...disliked]);

      const result = rankRecommendations(
        [
          row({ id: '2', categories: [{ id: 2, name: 'Disliked' }] }),
          row({ id: '1', categories: [{ id: 1, name: 'Loved' }] }),
        ],
        {
          ...signals({ historyCategories: new Set([1, 2]) }),
          feedbackProfile: profile,
        },
      );

      expect(order(result)).toEqual([1, 2]);
    });

    it('lifts proximity weight when the user keeps tagging plans "far" — without touching the radius', () => {
      const farProfile = buildFeedbackProfile(
        [1, 2, 3].map((id) => fb({ feedbackId: id, tags: ['far'] })),
      );
      const near = row({ id: '1', distanceKm: '1', averageRating: '0' });
      const farButLoved = row({ id: '2', distanceKm: '9', averageRating: '5' });
      const sig = signals({ hasLocation: true, radiusKm: 10 });

      // Base weight: the far, well-rated plan wins.
      expect(order(rankRecommendations([near, farButLoved], sig))).toEqual([
        2, 1,
      ]);

      // Far-sensitive: the near plan wins, and the 9km plan is still in range.
      const result = rankRecommendations([near, farButLoved], {
        ...sig,
        feedbackProfile: farProfile,
      });
      expect(order(result)).toEqual([1, 2]);
      expect(result).toHaveLength(2);
    });

    it('prefers a plan within the usual spend for a cost-sensitive user', () => {
      const profile = buildFeedbackProfile(
        [1, 2, 3].map((id) =>
          fb({
            feedbackId: id,
            tags: ['too_expensive'],
            actualCost: 1200,
            estimatedTotalCost: 1000,
          }),
        ),
      );
      const cheap = row({ id: '1', estimatedTotalCost: '500', categories: [] });
      const pricey = row({
        id: '2',
        estimatedTotalCost: '1500',
        categories: [],
      });

      const result = rankRecommendations([pricey, cheap], {
        ...signals(),
        feedbackProfile: profile,
      });

      expect(order(result)).toEqual([1, 2]);
      expect(result[0].reason).toBe('within_budget');
    });

    it('marks a plan "well_rated_by_you" when reinforced categories dominate', () => {
      const profile = buildFeedbackProfile([fb({ rating: 5, idCategory: 7 })]);
      const [result] = rankRecommendations(
        [row({ categories: [{ id: 7, name: 'Loved' }] })],
        { ...signals(), feedbackProfile: profile },
      );
      expect(result.reason).toBe('well_rated_by_you');
    });

    it('never surfaces a negative budget signal as a reason', () => {
      const profile = buildFeedbackProfile(
        [1, 2, 3].map((id) =>
          fb({
            feedbackId: id,
            tags: ['too_expensive'],
            actualCost: 1500,
            estimatedTotalCost: 1000,
          }),
        ),
      );
      const [result] = rankRecommendations(
        [row({ estimatedTotalCost: '9000', categories: [] })],
        { ...signals(), feedbackProfile: profile },
      );
      expect(result.reason).toBe('popular');
    });
  });
});
