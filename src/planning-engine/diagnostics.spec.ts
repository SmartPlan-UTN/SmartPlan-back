import type { PlanCandidate } from './candidate';
import { PlanningEngineService } from './planning-engine.service';
import type { PersonalSignalsService } from './ranking/personal-signals.service';
import type { CandidateRetrievalService } from './retrieval/candidate-retrieval.service';
import type { LiveVerificationService } from './verification/live-verification.service';
import {
  FRIDAY_AFTERNOON,
  intentFor,
  known,
  placeAction,
} from './testing/fixtures';

async function plan(
  query: string,
  candidates: PlanCandidate[],
  people = 1,
  budget = 10000,
  excludedPlaceIds: number[] = [],
) {
  const engine = new PlanningEngineService(
    {
      retrieve: jest.fn().mockResolvedValue({
        candidates,
        area: null,
        universe: candidates.length,
      }),
    } as unknown as CandidateRetrievalService,
    { verify: jest.fn() } as unknown as LiveVerificationService,
    { load: jest.fn() } as unknown as PersonalSignalsService,
  );
  return engine.plan({
    intent: intentFor(query, {
      partySize: people,
      budget,
      sources: {
        budget: 'text',
        partySize: 'text',
        duration: null,
        location: 'default',
      },
    }),
    rawQuery: query,
    requestedAt: FRIDAY_AFTERNOON,
    idUser: null,
    offline: true,
    excludedPlaceIds: new Set(excludedPlaceIds),
  });
}

describe('actionable price diagnostics', () => {
  it('does not quote a place the person explicitly excluded', async () => {
    const excluded = placeAction({ moments: ['dinner'], ...known(8000) });
    const allowed = placeAction({ moments: ['dinner'], ...known(20000) });
    const result = await plan(
      'Cena para 1 persona, máximo $5.000',
      [excluded, allowed],
      1,
      5000,
      [excluded.placeId],
    );
    expect(result.trace.diagnostics).toMatchObject({
      cheapestKnownTotal: 20000,
      reason: 'BUDGET',
    });
  });
  it('does not quote a group-only tariff to a solo visitor', async () => {
    const room = placeAction({
      placeKind: 'amusement',
      kind: 'OFFERING',
      activityId: 1,
      minPeople: 2,
      maxPeople: 8,
      ...known(18000),
    });
    const result = await plan('Algo divertido para 1 persona, máximo $10.000', [
      room,
    ]);
    expect(result.proposals).toHaveLength(0);
    expect(result.trace.diagnostics).toMatchObject({
      cheapestKnownTotal: null,
      reason: 'NO_CANDIDATES',
    });
  });

  it('quotes the compatible tariff even when it exceeds the requested budget', async () => {
    const couple = placeAction({
      placeKind: 'amusement',
      kind: 'OFFERING',
      activityId: 1,
      minPeople: 2,
      maxPeople: 2,
      ...known(22500),
    });
    const group = placeAction({
      placeKind: 'amusement',
      kind: 'OFFERING',
      activityId: 2,
      minPeople: 5,
      maxPeople: 8,
      ...known(18000),
    });
    const result = await plan(
      'Algo divertido para 2 personas, máximo $10.000',
      [couple, group],
      2,
    );
    expect(result.trace.diagnostics).toMatchObject({
      cheapestKnownTotal: 45000,
      reason: 'BUDGET',
    });
  });

  it('does not quote a lunch-only offering as the minimum price for dinner', async () => {
    const lunch = placeAction({
      kind: 'OFFERING',
      activityId: 1,
      moments: ['lunch'],
      ...known(8000),
    });
    const dinner = placeAction({
      kind: 'OFFERING',
      activityId: 2,
      moments: ['dinner'],
      ...known(20000),
    });
    const result = await plan(
      'Cena para 1 persona, máximo $5.000',
      [lunch, dinner],
      1,
      5000,
    );
    expect(result.trace.diagnostics).toMatchObject({
      cheapestKnownTotal: 20000,
      reason: 'BUDGET',
    });
  });
});
