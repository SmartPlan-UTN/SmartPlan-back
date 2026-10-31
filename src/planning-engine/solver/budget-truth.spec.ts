/**
 * Strict budgets are a promise: these regressions pin down that an unknown
 * price never reads as free, never ranks as cheap, and never lets a plan
 * claim to fit a budget it cannot prove.
 */
import type { PlanCandidate } from '../candidate';
import { staticFeasibility } from '../feasibility/feasibility';
import type { PlanIntent } from '../intent/plan-intent';
import { narrate } from '../narration/narration';
import { proposalRows } from '../persistence/proposal-rows';
import {
  EMPTY_PERSONAL_SIGNALS,
  rankCandidate,
  satisfiedExperience,
  type RankedCandidate,
} from '../ranking/ranking';
import { buildPlanShape } from '../shape/plan-shape';
import {
  FRIDAY_AFTERNOON,
  intentFor,
  placeAction,
  price,
} from '../testing/fixtures';
import { budgetStatusOf, solve } from './solver';
import { computePlanTotals } from '../../common/pricing/price';

function rankedSlots(intent: PlanIntent, candidates: PlanCandidate[]) {
  const shape = buildPlanShape(intent, FRIDAY_AFTERNOON);
  const bySlot = new Map<string, RankedCandidate[]>();
  for (const slot of shape.slots) {
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
        .filter(
          (ranked): ranked is RankedCandidate =>
            ranked !== null && ranked.feasibility.verdict !== 'INFEASIBLE',
        )
        .sort((a, b) => b.score - a.score),
    );
  }
  return { shape, bySlot };
}

const strict70 = () =>
  intentFor('cena romántica para dos por menos de $70.000', {
    budget: 70000,
    partySize: 2,
    sources: {
      budget: 'text',
      partySize: 'text',
      duration: null,
      location: 'default',
    },
  });

describe('budget truth', () => {
  it('classifies known, unknown and exceeding totals from evidence only', () => {
    const budget = { budget: { amount: 70000, strict: true } } as Pick<
      PlanIntent,
      'budget'
    >;
    const free = price({ priceKind: 'FREE', priceMin: 0, priceMax: 0 });
    const unknown = price({ priceKind: 'UNKNOWN' });
    const dinner100 = price({
      priceKind: 'FIXED',
      priceMin: 50000,
      priceMax: 50000,
    });
    const from30 = price({ priceKind: 'FROM', priceMin: 30000 });
    const range = price({
      priceKind: 'RANGE',
      priceMin: 25000,
      priceMax: 30000,
    });

    // A free viewpoint does not make a $100k dinner fit $70k.
    expect(
      budgetStatusOf(computePlanTotals([free, dinner100], 2), budget),
    ).toBe('EXCEEDS');
    // Free + unknown is not a $0 plan and not a fit.
    const freeUnknown = computePlanTotals([free, unknown], 2);
    expect(budgetStatusOf(freeUnknown, budget)).toBe('UNCERTAIN');
    // "Desde" can never prove a fit.
    expect(budgetStatusOf(computePlanTotals([from30], 2), budget)).toBe(
      'UNCERTAIN',
    );
    expect(budgetStatusOf(computePlanTotals([range, free], 2), budget)).toBe(
      'WITHIN',
    );
  });

  it('never persists or narrates an unknown dinner as a $0 plan', () => {
    const intent = strict70();
    const candidates = [
      placeAction({
        placeId: 1,
        placeKind: 'bar',
        action: 'drinks',
        placeName: 'Bar Gratis',
        price: price({ priceKind: 'FREE', priceMin: 0, priceMax: 0 }),
      }),
      placeAction({ placeId: 2, placeName: 'Resto Sin Precio' }),
    ];
    const { shape, bySlot } = rankedSlots(intent, candidates);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals.length).toBeGreaterThan(0);
    const [narration] = narrate(proposals, intent, FRIDAY_AFTERNOON);
    expect(proposals[0].budgetStatus).toBe('UNCERTAIN');
    expect(narration.uncertainties[0]).toContain('No podemos asegurar');
    expect(narration.uncertainties[0]).toContain('Resto Sin Precio');
    expect(narration.why).not.toContain('presupuesto');
    const rows = proposalRows({
      proposal: proposals[0],
      narration,
      intent,
      idUser: 1,
      idPlanRequest: 1,
      idPlanStatus: 1,
      route: null,
    });
    expect(rows.plan.estimatedTotalCost).toBeNull();
  });

  it('ranks a known price that fits above an unknown one under a budget', () => {
    const intent = strict70();
    const known = placeAction({
      placeId: 10,
      price: price({ priceKind: 'FIXED', priceMin: 30000, priceMax: 30000 }),
    });
    const unknown = placeAction({ placeId: 11 });
    const { bySlot, shape } = rankedSlots(intent, [known, unknown]);
    const anchor = shape.slots.find((slot) => slot.role === 'ANCHOR')!;
    const ranked = bySlot.get(anchor.id)!;
    const value = (id: number) =>
      ranked.find((entry) => entry.candidate.placeId === id)!.components.value;
    expect(value(10)).toBeGreaterThan(value(11));
    expect(ranked[0].candidate.placeId).toBe(10);
  });

  it('prefers a plan proven to fit over an unproven one for a strict budget', () => {
    const intent = strict70();
    const unknown = placeAction({ placeId: 20, latitude: -32.8895 });
    const known = placeAction({
      placeId: 21,
      latitude: -32.8897,
      price: price({ priceKind: 'RANGE', priceMin: 25000, priceMax: 32000 }),
    });
    const { shape, bySlot } = rankedSlots(intent, [unknown, known]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals[0].role).toBe('BEST');
    expect(proposals[0].budgetStatus).toBe('WITHIN');
  });

  it('never lets an offering that names no meal stand in for lunch', () => {
    const tasting = placeAction({
      kind: 'OFFERING',
      key: 'o:1',
      activityId: 1,
      placeKind: 'winery',
      action: 'winery_meal',
      moments: null,
    });
    const lunch = { ...tasting, key: 'o:2', moments: ['lunch' as const] };
    expect(satisfiedExperience(tasting, ['lunch'])).toBeNull();
    expect(satisfiedExperience(lunch, ['lunch'])).toBe('lunch');
    // A restaurant's intrinsic moments still satisfy its meals.
    expect(satisfiedExperience(placeAction(), ['dinner'])).toBe('dinner');
  });
});
