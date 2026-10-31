import { PlanningEngineService } from '../planning-engine.service';
import type { PersonalSignalsService } from '../ranking/personal-signals.service';
import type { CandidateRetrievalService } from '../retrieval/candidate-retrieval.service';
import {
  FRIDAY_AFTERNOON,
  intentFor,
  known,
  placeAction,
} from '../testing/fixtures';
import type { LiveVerificationService } from './live-verification.service';

describe('live verification allowance across planning rounds', () => {
  it.each([0, 1])(
    'never spends more than %i hours checks per request',
    async (limit) => {
      const candidate = placeAction({ googlePlaceId: 'fixture-place' });
      const verify = jest.fn().mockResolvedValue({
        updated: new Map([
          [candidate.key, { ...candidate, hours: known().hours }],
        ]),
        locationsVerified: 0,
        hoursVerified: 1,
        pricesVerified: 0,
        enrichmentNeeded: [],
        closed: [],
        skipped: null,
      });
      const engine = new PlanningEngineService(
        {
          retrieve: jest.fn().mockResolvedValue({
            candidates: [candidate],
            area: null,
            universe: 1,
          }),
        } as unknown as CandidateRetrievalService,
        {
          perRequestBudget: () => limit,
          verify,
        } as unknown as LiveVerificationService,
        {} as PersonalSignalsService,
      );
      await engine.plan({
        intent: intentFor('cena'),
        rawQuery: 'cena',
        requestedAt: FRIDAY_AFTERNOON,
        idUser: null,
      });
      expect(verify).toHaveBeenCalledTimes(limit);
    },
  );
});
