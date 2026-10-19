import { rankCandidate, EMPTY_PERSONAL_SIGNALS } from './ranking';
import { intentFor, known, placeAction, price } from '../testing/fixtures';
import { staticFeasibility } from '../feasibility/feasibility';

describe('evidence-weighted contextual ranking', () => {
  it('does not let operational completeness turn an expensive dinner into a cheap recommendation', () => {
    const intent = intentFor('comer barato');
    const expensive = placeAction({
      ...known(),
      price: price({ priceKind: 'FIXED', priceMin: 60000, priceMax: 60000 }),
    });
    const affordable = placeAction({
      ...known(),
      price: price({ priceKind: 'FIXED', priceMin: 12000, priceMax: 12000 }),
    });
    const rank = (candidate: typeof expensive) =>
      rankCandidate(
        candidate,
        staticFeasibility(candidate, intent, 10),
        ['dinner'],
        intent,
        EMPTY_PERSONAL_SIGNALS,
        1,
      )!;
    expect(rank(affordable).score - rank(expensive).score).toBeGreaterThan(0.2);
  });

  it('ranks a supported quiet atmosphere above a stronger-looking kind prior', () => {
    const intent = intentFor('una cena tranquila');
    const weak = placeAction({
      traits: [
        { trait: 'quiet', source: 'PRIOR', score: 0.9, confidence: 0.3 },
      ],
    });
    const supported = {
      ...weak,
      traits: [
        {
          trait: 'quiet' as const,
          source: 'CURATED' as const,
          score: 0.7,
          confidence: 0.9,
          evidence: 'Quiet room verified by the curator',
        },
      ],
    };
    const rank = (candidate: typeof weak) =>
      rankCandidate(
        candidate,
        staticFeasibility(candidate, intent, 10),
        ['dinner'],
        intent,
        EMPTY_PERSONAL_SIGNALS,
        1,
      )!;
    expect(rank(supported).components.intentFit).toBeGreaterThan(
      rank(weak).components.intentFit,
    );
  });
});
