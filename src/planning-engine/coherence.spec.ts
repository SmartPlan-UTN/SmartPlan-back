import type { PlanCandidate } from './candidate';
import { timedFeasibility } from './feasibility/feasibility';
import type { PlanIntent } from './intent/plan-intent';
import { PlanningEngineService } from './planning-engine.service';
import type { PersonalSignalsService } from './ranking/personal-signals.service';
import type { CandidateRetrievalService } from './retrieval/candidate-retrieval.service';
import type { LiveVerificationService } from './verification/live-verification.service';
import { FRIDAY_AFTERNOON, intentFor, placeAction } from './testing/fixtures';

const FRIDAY = 5;

function engine(candidates: PlanCandidate[]) {
  return new PlanningEngineService(
    {
      retrieve: jest.fn(() =>
        Promise.resolve({
          candidates,
          area: null,
          universe: candidates.length,
        }),
      ),
    } as unknown as CandidateRetrievalService,
    { verify: jest.fn() } as unknown as LiveVerificationService,
    { load: jest.fn() } as unknown as PersonalSignalsService,
  );
}

async function plansFor(query: string, candidates: PlanCandidate[]) {
  const intent: PlanIntent = intentFor(query);
  const result = await engine(candidates).plan({
    intent,
    rawQuery: query,
    requestedAt: FRIDAY_AFTERNOON,
    idUser: null,
    offline: true,
  });
  return result.proposals.map((proposal) =>
    proposal.stops.map(({ ranked }) => ranked.candidate.placeKind),
  );
}

describe('coherent plans (#210)', () => {
  it('never offers drinks before and after the same dinner', async () => {
    const plans = await plansFor('Quiero salir a comer algo con mi novia', [
      placeAction({ placeKind: 'restaurant' }),
      placeAction({ placeKind: 'restaurant' }),
      placeAction({ placeKind: 'bar' }),
      placeAction({ placeKind: 'bar' }),
      placeAction({ placeKind: 'ice_cream' }),
    ]);
    expect(plans.length).toBeGreaterThan(0);
    for (const kinds of plans)
      expect(kinds.filter((kind) => kind === 'bar').length).toBeLessThan(2);
  });

  it('never puts the ice cream before the meal', async () => {
    const plans = await plansFor('Pizza con la familia', [
      placeAction({ placeKind: 'restaurant' }),
      placeAction({ placeKind: 'ice_cream' }),
      placeAction({ placeKind: 'ice_cream' }),
    ]);
    for (const kinds of plans) {
      const sweet = kinds.indexOf('ice_cream');
      if (sweet >= 0)
        expect(sweet).toBeGreaterThan(kinds.indexOf('restaurant'));
    }
  });

  it('reads a dish as a meal, noon as lunch and a sunset before it sets', () => {
    expect(
      intentFor('Sushi con amigos').experiences.map(({ key }) => key),
    ).toEqual(['dinner']);
    expect(
      intentFor('Parrilla el domingo al mediodía').experiences.map(
        ({ key }) => key,
      ),
    ).toEqual(['lunch']);
    // October in Mendoza: the sun sets about 19:40.
    expect(
      intentFor('Ver el atardecer con mi novia').when.startMinutes,
    ).toBeLessThan(19 * 60 + 40);
  });

  it('keeps an offering with no catalog times to its kind hours', () => {
    const museum = {
      ...placeAction({ placeKind: 'museum', action: 'museum_visit' }),
      kind: 'OFFERING' as const,
      activityId: 7,
      availableTimesOfDay: [],
      hours: null,
    };
    expect(
      timedFeasibility(museum, FRIDAY, 20 * 60, 21 * 60).reasons,
    ).toContain('outside_typical_hours');
  });

  it('drops a venue as a family stop when none of its offerings suits kids', async () => {
    const escape = placeAction({ placeId: 950, placeKind: 'amusement' });
    const escapeRoom: PlanCandidate = {
      ...escape,
      kind: 'OFFERING',
      key: 'o:950',
      activityId: 950,
      occasions: ['friends', 'romantic'],
    };
    const plans = await plansFor('Plan con los nenes', [
      escape,
      escapeRoom,
      placeAction({ placeKind: 'museum', action: 'museum_visit' }),
    ]);
    for (const kinds of plans) expect(kinds).not.toContain('amusement');
  });
});
