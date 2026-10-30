import {
  compareRecommendationEvidence,
  sharedExperienceScore,
} from './community-plan-recommendations.service';

describe('community recommendation evidence ranking', () => {
  it('puts fully evidenced options before uncertain ones regardless of source or score', () => {
    const community = { id: 8, decisionGrade: true, score: 0.3 };
    const generated = { id: 2, decisionGrade: false, score: 100 };

    expect(compareRecommendationEvidence(community, generated)).toBeLessThan(0);
  });

  it('uses the same score comparison for both sources when evidence grades match', () => {
    const generated = { id: 9, decisionGrade: true, score: 0.82 };
    const community = { id: 3, decisionGrade: true, score: 0.91 };

    expect(compareRecommendationEvidence(community, generated)).toBeLessThan(0);
  });

  it('shrinks small rating samples and gives recent shared experiences a bounded freshness signal', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    const one = {
      planId: 1,
      averageRating: 5,
      count: 1,
      latestAt: new Date('2026-10-26T12:00:00.000Z'),
    };
    const many = {
      planId: 2,
      averageRating: 5,
      count: 30,
      latestAt: new Date('2026-10-26T12:00:00.000Z'),
    };
    const old = {
      planId: 3,
      averageRating: 5,
      count: 30,
      latestAt: new Date('2024-10-26T12:00:00.000Z'),
    };

    expect(sharedExperienceScore(one, now)).toBeLessThan(
      sharedExperienceScore(many, now),
    );
    expect(sharedExperienceScore(many, now)).toBeGreaterThan(
      sharedExperienceScore(old, now),
    );
    expect(sharedExperienceScore(many, now)).toBeLessThanOrEqual(0.055);
  });
});
