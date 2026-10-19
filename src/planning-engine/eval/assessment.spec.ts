import { computePlanTotals } from '../../common/pricing/price';
import type { PlanCandidate } from '../candidate';
import type { Feasibility } from '../feasibility/feasibility';
import { EMPTY_PERSONAL_SIGNALS, rankCandidate } from '../ranking/ranking';
import { budgetStatusOf, type PlanProposal } from '../solver/solver';
import { intentFor, placeAction, price } from '../testing/fixtures';
import { assessProposal, assessScenario } from './assessment';

const WEEK_OPEN = {
  weekly: Array.from(
    { length: 7 },
    () => [[12 * 60, 25 * 60]] as [number, number][],
  ),
  source: 'OFFICIAL' as const,
  verifiedAt: new Date('2026-10-16'),
};

function proposal(
  candidate: PlanCandidate,
  options: {
    feasibility?: Feasibility;
    experience?: 'dinner';
    budget?: number;
  } = {},
): PlanProposal {
  const feasibility = options.feasibility ?? {
    verdict: 'FEASIBLE',
    reasons: [],
  };
  const intent = intentFor('cena', {
    budget: options.budget ?? null,
    sources: {
      budget: options.budget ? 'text' : null,
      partySize: null,
      duration: null,
      location: 'default',
    },
  });
  const ranked = rankCandidate(
    candidate,
    feasibility,
    ['dinner'],
    intent,
    EMPTY_PERSONAL_SIGNALS,
    1,
  )!;
  const totals = computePlanTotals([candidate.price], 2);
  return {
    role: 'BEST',
    stops: [
      {
        ranked,
        slotId: 'anchor-1',
        slotRole: 'ANCHOR',
        experience: options.experience ?? 'dinner',
        start: 21 * 60,
        end: 22 * 60 + 40,
        travelMinutesFromPrevious: 0,
        legKmFromPrevious: 0,
        feasibility,
      },
    ],
    start: 21 * 60,
    end: 22 * 60 + 40,
    travelMinutes: 0,
    travelKm: 0,
    totals,
    budgetStatus: budgetStatusOf(totals, intent),
    score: 1,
  };
}

const fixed = (amount: number) =>
  price({ priceKind: 'FIXED', priceMin: amount, priceMax: amount });

describe('evaluation V2 assessment', () => {
  it('does not call a contextually unproven date FULL merely because hours and prices exist', () => {
    const candidate = placeAction({ hours: WEEK_OPEN, price: fixed(20000) });
    const result = assessProposal(
      intentFor('una cena romántica'),
      proposal(candidate),
    );
    expect(result.satisfaction).toBe('UNCERTAIN');
    expect(result.uncertainties).toContain('context_unconfirmed');
  });
  it('never counts a dinner as satisfying "cine y cena"', () => {
    const verdict = assessProposal(
      intentFor('cine y cena'),
      proposal(placeAction({ price: fixed(20000), hours: WEEK_OPEN })),
      ['movie', 'dinner'],
    );
    expect(verdict.satisfaction).toBe('PARTIAL');
    expect(verdict.components).toEqual({
      movie: 'MISSING',
      dinner: 'SATISFIED',
    });
  });

  it('is FULL only with confirmed hours and a proven budget', () => {
    const intent = intentFor('cena', {
      budget: 70000,
      sources: {
        budget: 'text',
        partySize: 'text',
        duration: null,
        location: 'default',
      },
    });
    const confirmed = assessProposal(
      intent,
      proposal(placeAction({ price: fixed(30000), hours: WEEK_OPEN }), {
        budget: 70000,
      }),
      ['dinner'],
    );
    expect(confirmed.satisfaction).toBe('FULL');
    expect(confirmed.verifiedBudgetFit).toBe(true);

    const noHours = assessProposal(
      intent,
      proposal(placeAction({ price: fixed(30000) }), {
        budget: 70000,
        feasibility: { verdict: 'UNCERTAIN', reasons: ['hours_unknown'] },
      }),
      ['dinner'],
    );
    expect(noHours.satisfaction).toBe('UNCERTAIN');

    const unknownPrice = assessProposal(
      intent,
      proposal(placeAction({ hours: WEEK_OPEN }), { budget: 70000 }),
      ['dinner'],
    );
    expect(unknownPrice.verifiedBudgetFit).toBe(false);
    expect(unknownPrice.uncertainties).toContain('budget_unconfirmed');
  });

  it('fails a plan that claims a budget fit it cannot prove', () => {
    const plan = proposal(placeAction({ hours: WEEK_OPEN }), { budget: 70000 });
    const lying = { ...plan, budgetStatus: 'WITHIN' as const };
    const verdict = assessProposal(
      intentFor('cena', {
        budget: 70000,
        sources: {
          budget: 'text',
          partySize: null,
          duration: null,
          location: 'default',
        },
      }),
      lying,
      ['dinner'],
    );
    expect(verdict.failures).toContain('false_budget_fit');
    expect(verdict.satisfaction).toBe('FAILED');
  });

  it('treats an honest refusal as the right answer to an impossible request', () => {
    const intent = intentFor('cena por menos de $8.000');
    expect(
      assessScenario(intent, [], [], {
        requires: ['dinner'],
        expectsNoPlan: true,
      }).satisfaction,
    ).toBe('FULL');
    const pretending = {
      ...proposal(placeAction({ price: fixed(3000), hours: WEEK_OPEN })),
      budgetStatus: 'WITHIN' as const,
    };
    expect(
      assessScenario(intent, [pretending], [], {
        requires: ['dinner'],
        expectsNoPlan: true,
      }).satisfaction,
    ).toBe('FAILED');
  });

  it('keeps regression failures distinct from uncertainty', () => {
    const plan = proposal(
      placeAction({ price: fixed(20000), hours: WEEK_OPEN }),
    );
    expect(
      assessScenario(intentFor('cena'), [plan], ['dominant_venue:1x9'])
        .satisfaction,
    ).toBe('FAILED');
    expect(assessScenario(intentFor('cena'), [plan]).satisfaction).toBe('FULL');
  });
});
