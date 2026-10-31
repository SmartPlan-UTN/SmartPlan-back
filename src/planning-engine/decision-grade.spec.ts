import type { PlanCandidate } from './candidate';
import { isDecisionGrade } from './decision-grade';
import { staticFeasibility } from './feasibility/feasibility';
import type { PlanIntent } from './intent/plan-intent';
import {
  EMPTY_PERSONAL_SIGNALS,
  rankCandidate,
  type RankedCandidate,
} from './ranking/ranking';
import { buildPlanShape } from './shape/plan-shape';
import { sameBrand, solve } from './solver/solver';
import {
  FRIDAY_AFTERNOON,
  intentFor,
  known,
  placeAction,
  price,
} from './testing/fixtures';

function rankedSlots(intent: PlanIntent, candidates: PlanCandidate[]) {
  const shape = buildPlanShape(intent, FRIDAY_AFTERNOON);
  const bySlot = new Map<string, RankedCandidate[]>();
  for (const slot of shape.slots)
    bySlot.set(
      slot.id,
      candidates
        .map((candidate) =>
          rankCandidate(
            candidate,
            staticFeasibility(candidate, intent, 10),
            slot.experiences,
            intent,
            EMPTY_PERSONAL_SIGNALS,
            1,
          ),
        )
        .filter((r): r is RankedCandidate => r !== null)
        .sort((a, b) => b.score - a.score),
    );
  return { shape, bySlot };
}

describe('decision grade', () => {
  it('prefers documented requested atmosphere over a priced venue with no contextual evidence', () => {
    const intent = intentFor('cena romántica');
    const priced = placeAction({ placeId: 91, ...known() });
    const romantic = placeAction({
      placeId: 92,
      traits: [
        {
          trait: 'romantic',
          score: 0.9,
          confidence: 0.9,
          source: 'CURATED',
          evidence: 'Documented romantic dining room',
        },
      ],
    });
    const { shape, bySlot } = rankedSlots(intent, [priced, romantic]);
    const [best] = solve({ intent, shape, candidatesBySlot: bySlot }).proposals;
    expect(
      best.stops.find((stop) => stop.slotRole === 'ANCHOR')?.ranked.candidate
        .placeId,
    ).toBe(92);
    expect(best.contextGrade).toBe(true);
    expect(best.decisionGrade).toBe(false);
  });

  it('needs known hours for the day and a usable price', () => {
    expect(isDecisionGrade(placeAction(), 5, 21 * 60)).toBe(false);
    expect(isDecisionGrade(placeAction({ ...known() }), 5, 21 * 60)).toBe(true);
    expect(
      isDecisionGrade(
        placeAction({ ...known(), price: price({ priceKind: 'UNKNOWN' }) }),
        5,
        21 * 60,
      ),
    ).toBe(false);
  });

  it('recommends a plan it can stand behind over a stronger-looking unknown', () => {
    const intent = intentFor('cena');
    const unknownButFamous = placeAction({
      placeId: 1,
      name: 'Cocina Sierra',
      placeName: 'Cocina Sierra',
      quality: { rating: 4.9, ratingCount: 900, source: 'smartplan' },
    });
    const verified = placeAction({
      placeId: 2,
      name: 'Mesa del Parque',
      placeName: 'Mesa del Parque',
      latitude: -32.8899,
      ...known(),
    });
    const { shape, bySlot } = rankedSlots(intent, [unknownButFamous, verified]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals[0].role).toBe('BEST');
    expect(proposals[0].decisionGrade).toBe(true);
    expect(proposals[0].stops[0].ranked.candidate.placeId).toBe(2);
    expect(proposals).toHaveLength(2);
    expect(proposals[1].decisionGrade).toBe(false);
    expect(proposals[1].stops[0].feasibility.reasons).toEqual(
      expect.arrayContaining(['hours_unknown', 'price_unknown']),
    );
    expect(proposals[1].role).not.toBe('VALUE');
  });

  it('keeps a materially better specialized experience ahead of generic operational completeness', () => {
    const intent: PlanIntent = {
      ...intentFor('cerveza con amigos'),
      vibe: ['craft_beer'],
    };
    const restaurant = placeAction({
      placeId: 10,
      name: 'Mesa del Parque',
      placeName: 'Mesa del Parque',
      action: 'craft_beer',
      secondaryAction: true,
      menuEvidence: [
        {
          name: 'Pinta de cerveza artesanal',
          activityId: 1,
          price: price({ priceKind: 'FIXED', priceMin: 9000, priceMax: 9000 }),
          moments: ['dinner'],
        },
      ],
      ...known(),
    });
    const brewery = placeAction({
      placeId: 11,
      name: 'La Fábrica Cervecera',
      placeName: 'La Fábrica Cervecera',
      placeKind: 'brewery',
      action: 'craft_beer',
      traits: [
        {
          trait: 'craft_beer',
          score: 1,
          confidence: 0.9,
          source: 'CURATED',
          evidence: 'Cervecería con elaboración artesanal documentada',
        },
      ],
    });
    const { shape, bySlot } = rankedSlots(intent, [restaurant, brewery]);
    const { proposals } = solve({
      intent,
      shape,
      candidatesBySlot: bySlot,
    });
    expect(proposals[0].stops[0].ranked.candidate.placeId).toBe(11);
    expect(proposals[0].decisionGrade).toBe(false);
    expect(proposals).toHaveLength(2);
    expect(proposals[1].decisionGrade).toBe(true);
  });

  it('never adds an optional extra with unknown hours or price', () => {
    const intent = intentFor('cena');
    const dinner = placeAction({ placeId: 10, ...known() });
    const unknownBar = placeAction({
      placeId: 11,
      placeKind: 'bar',
      action: 'drinks',
      latitude: -32.8897,
    });
    const { shape, bySlot } = rankedSlots(intent, [dinner, unknownBar]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    for (const proposal of proposals)
      expect(
        proposal.stops.some((stop) => stop.ranked.candidate.placeId === 11),
      ).toBe(false);
  });

  it('under a strict budget, only a proven upper bound is decision-grade', () => {
    const intent = intentFor('cena, tenemos $20.000', {
      budget: 20000,
      sources: { budget: 'text' } as never,
    });
    const wide = placeAction({
      placeId: 20,
      ...known(),
      price: price({ priceKind: 'RANGE', priceMin: 8000, priceMax: 15000 }),
    });
    const { shape, bySlot } = rankedSlots(intent, [wide]);
    const [best] = solve({ intent, shape, candidatesBySlot: bySlot }).proposals;
    if (intent.budget?.strict) {
      expect(best.evidenceGrade).toBe(true);
      expect(best.decisionGrade).toBe(best.budgetStatus === 'WITHIN');
    }
  });
});

describe('sameBrand', () => {
  it('treats branches as one brand, different venues of a kind as different', () => {
    expect(sameBrand('Berlina', 'Berlina Arístides')).toBe(true);
    expect(sameBrand('Starbucks', 'Starbucks')).toBe(true);
    expect(sameBrand('Bodega Catena', 'Bodega Salentein')).toBe(false);
    expect(sameBrand('Lugar 100', 'Lugar 101')).toBe(false);
    expect(sameBrand('Museo del Vino', 'Museo del Área Fundacional')).toBe(
      false,
    );
  });
});
