import {
  buildFeedbackProfile,
  FeedbackProfileRow,
  NEUTRAL_FEEDBACK_PROFILE,
} from './recommendation-feedback-profile';

function fbRow(overrides: Partial<FeedbackProfileRow>): FeedbackProfileRow {
  return {
    feedbackId: 1,
    rating: 3,
    tags: [],
    actualCost: null,
    estimatedTotalCost: null,
    idCategory: null,
    ...overrides,
  };
}

describe('buildFeedbackProfile (CU21)', () => {
  it('returns the neutral profile with no feedback', () => {
    expect(buildFeedbackProfile([])).toBe(NEUTRAL_FEEDBACK_PROFILE);
  });

  it('counts distinct feedbacks, not rows', () => {
    const profile = buildFeedbackProfile([
      fbRow({ feedbackId: 1, idCategory: 1 }),
      fbRow({ feedbackId: 1, idCategory: 2 }),
      fbRow({ feedbackId: 2, idCategory: 1 }),
    ]);
    expect(profile.feedbackCount).toBe(2);
  });

  it('shrinks category affinity toward neutral when only one feedback backs it', () => {
    const one = buildFeedbackProfile([fbRow({ rating: 5, idCategory: 1 })]);
    const many = buildFeedbackProfile(
      [1, 2, 3, 4, 5].map((id) =>
        fbRow({ feedbackId: id, rating: 5, idCategory: 1 }),
      ),
    );

    const oneAffinity = one.categoryAffinity.get(1) ?? 1;
    const manyAffinity = many.categoryAffinity.get(1) ?? 1;

    expect(oneAffinity).toBeGreaterThan(1);
    expect(manyAffinity).toBeGreaterThan(oneAffinity);
  });

  it('keeps a rating-3 category neutral (no entry)', () => {
    const profile = buildFeedbackProfile([
      fbRow({ rating: 3, idCategory: 1 }),
      fbRow({ feedbackId: 2, rating: 3, idCategory: 1 }),
    ]);
    expect(profile.categoryAffinity.has(1)).toBe(false);
  });

  it('reinforces categories the user rated 4-5 or endorsed by tag', () => {
    const profile = buildFeedbackProfile([
      fbRow({ feedbackId: 1, rating: 5, idCategory: 1 }),
      fbRow({ feedbackId: 2, rating: 2, tags: ['great_value'], idCategory: 2 }),
      fbRow({ feedbackId: 3, rating: 2, idCategory: 3 }),
    ]);
    expect([...profile.reinforcedCategories].sort()).toEqual([1, 2]);
  });

  it('derives cost sensitivity from the too_expensive tag and overspend', () => {
    const taggedOnly = buildFeedbackProfile([
      fbRow({ feedbackId: 1, tags: ['too_expensive'] }),
      fbRow({ feedbackId: 2, tags: [] }),
    ]);
    expect(taggedOnly.costSensitivity).toBeCloseTo(0.5);

    const overspends = buildFeedbackProfile([
      fbRow({ feedbackId: 1, actualCost: 1500, estimatedTotalCost: 1000 }),
    ]);
    expect(overspends.costSensitivity).toBeCloseTo(0.5);
  });

  it('computes the median spend ratio and reference cost', () => {
    const profile = buildFeedbackProfile([
      fbRow({ feedbackId: 1, actualCost: 800, estimatedTotalCost: 1000 }),
      fbRow({ feedbackId: 2, actualCost: 1200, estimatedTotalCost: 1000 }),
      fbRow({ feedbackId: 3, actualCost: 2000, estimatedTotalCost: 2000 }),
    ]);
    expect(profile.typicalSpendRatio).toBeCloseTo(1.0);
    expect(profile.referenceCost).toBe(1000);
  });

  it('derives distance sensitivity from the far tag', () => {
    const profile = buildFeedbackProfile([
      fbRow({ feedbackId: 1, tags: ['far'] }),
      fbRow({ feedbackId: 2, tags: ['far'] }),
      fbRow({ feedbackId: 3, tags: [] }),
      fbRow({ feedbackId: 4, tags: [] }),
    ]);
    expect(profile.distanceSensitivity).toBeCloseTo(0.5);
  });

  it('reports hasSignal only when something departs from neutral', () => {
    expect(
      buildFeedbackProfile([fbRow({ rating: 3, idCategory: 1 })]).hasSignal,
    ).toBe(false);
    expect(
      buildFeedbackProfile([fbRow({ rating: 5, idCategory: 1 })]).hasSignal,
    ).toBe(true);
  });
});
