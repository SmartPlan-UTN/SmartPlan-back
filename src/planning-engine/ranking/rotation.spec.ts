import { staticFeasibility } from '../feasibility/feasibility';
import { tieBreak } from '../planning-engine.service';
import { intentFor, placeAction, price } from '../testing/fixtures';
import { EMPTY_PERSONAL_SIGNALS, rankCandidate } from './ranking';
import { rotationSpan } from './rotation';

describe('evidence-aware request rotation', () => {
  it('varies equally unknown places without giving them extra rotation against priced evidence', () => {
    const unknown = placeAction({ placeKind: 'amusement', placeId: 1167 });
    const documented = placeAction({
      placeKind: 'amusement',
      placeId: 2010,
      kind: 'OFFERING',
      activityId: 75,
      price: price({ priceKind: 'FIXED', priceMin: 22500, priceMax: 22500 }),
    });
    expect(
      rotationSpan([unknown, placeAction({ placeKind: 'amusement' })]),
    ).toBe(0.05);
    const span = rotationSpan([unknown, documented]);
    const intent = intentFor('Algo divertido para 2 personas');
    const ranked = [unknown, documented].map(
      (candidate) =>
        rankCandidate(
          candidate,
          staticFeasibility(candidate, intent, 10),
          ['fun'],
          intent,
          EMPTY_PERSONAL_SIGNALS,
          1,
        )!,
    );
    for (let day = 1; day <= 31; day++) {
      const seed = `2026-10-${day}|fun`;
      expect(
        ranked[1].score + tieBreak(seed, documented.placeId, span),
      ).toBeGreaterThan(
        ranked[0].score + tieBreak(seed, unknown.placeId, span),
      );
    }
  });
});
