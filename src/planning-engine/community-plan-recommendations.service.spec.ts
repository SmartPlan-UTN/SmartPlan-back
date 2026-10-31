import {
  CommunityPlanRecommendationsService,
  compareRecommendationEvidence,
  sharedExperienceScore,
} from './community-plan-recommendations.service';
import { intentFor } from './testing/fixtures';

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

describe('community recommendations cache', () => {
  it('reuses a recent result for the same request and generated plans', async () => {
    const retrieve = jest.fn().mockResolvedValue({ candidates: [] });
    const service = new CommunityPlanRecommendationsService(
      {} as never,
      { retrieve } as never,
      { load: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const request = {
      id: 7,
      idUser: 3,
      resolvedOptions: { intent: intentFor('cena en Ciudad de Mendoza') },
    } as never;

    await service.recommend(request, [1, 2]);
    await service.recommend(request, [1, 2]);
    expect(retrieve).toHaveBeenCalledTimes(1);
    await service.recommend(request, [1, 3]);
    expect(retrieve).toHaveBeenCalledTimes(2);
  });
});
