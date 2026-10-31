import type { PlanCandidate } from './candidate';
import { staticFeasibility, timedFeasibility } from './feasibility/feasibility';
import type { PlanIntent } from './intent/plan-intent';
import { PlanningEngineService } from './planning-engine.service';
import type { PersonalSignalsService } from './ranking/personal-signals.service';
import type { CandidateRetrievalService } from './retrieval/candidate-retrieval.service';
import type { LiveVerificationService } from './verification/live-verification.service';
import { understandingOf } from './intent/understanding';
import { narrate } from './narration/narration';
import { fitsOccasions, occasionMatch } from './occasions';
import {
  EMPTY_PERSONAL_SIGNALS,
  rankCandidate,
  type RankedCandidate,
} from './ranking/ranking';
import { buildPlanShape, homeMayClose } from './shape/plan-shape';
import { haversineKm, solve } from './solver/solver';
import {
  FRIDAY_AFTERNOON,
  intentFor,
  placeAction,
  price,
} from './testing/fixtures';

const FRIDAY = 5;
const START = { latitude: -32.8895, longitude: -68.8458 };

/** A game at the Hogar: an offering with no department or address. */
function game(
  activityId: number,
  overrides: Partial<PlanCandidate> = {},
): PlanCandidate {
  return {
    ...placeAction({ placeKind: 'home' }),
    placeId: 587,
    kind: 'OFFERING',
    key: `o:${activityId}`,
    activityId,
    action: 'game',
    name: `Juego ${activityId}`,
    placeName: 'En casa / donde estén',
    idDepartment: null,
    departmentName: null,
    latitude: null,
    longitude: null,
    location: 'HOME',
    distanceKm: null,
    durationMinutes: 45,
    price: price({ priceKind: 'FREE', priceMin: 0, priceMax: 0 }),
    occasions: ['friends', 'family'],
    ...overrides,
  };
}

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
        .filter(
          (ranked): ranked is RankedCandidate =>
            ranked !== null && ranked.feasibility.verdict !== 'INFEASIBLE',
        )
        .sort((a, b) => b.score - a.score),
    );
  return { shape, bySlot };
}

describe('games and plans at home (#210)', () => {
  describe('intent', () => {
    it('reads staying home as the whole plan', () => {
      const intent = intentFor('noche de juegos en casa con 6 personas', {
        partySize: 6,
      });
      expect(intent.constraints.atHome).toBe(true);
      // "Juegos" asks for games; "en casa" alone is games and plans.
      expect(intent.experiences).toEqual([
        { key: 'home_game', required: true },
      ]);
      expect(understandingOf(intent, FRIDAY_AFTERNOON).chips[0]).toMatchObject({
        label: 'Juegos en casa',
      });
      expect(intentFor('algo tranqui en casa').experiences).toEqual([
        { key: 'at_home', required: true },
      ]);
    });

    it('takes stay home and free from the chips or the model too', () => {
      const intent = intentFor('algo para hacer', {
        atHome: true,
        freeOnly: true,
      });
      expect(intent.constraints).toMatchObject({
        atHome: true,
        freeOnly: true,
      });
      expect(intent.provenance.constraints).toBe('explicit');
    });

    it.each([
      'cenar en lo de Pancho',
      'almorzar en Casa del Visitante',
      'algo sin salir de Maipú',
      'un bar con juegos de mesa',
      'no quiero quedarme en casa',
    ])('never reads an outing as staying home: %s', (query) => {
      expect(intentFor(query).constraints.atHome).toBe(false);
    });

    it('never reads "de arriba" as free', () => {
      expect(
        intentFor('una cena con vista de arriba de la ciudad').constraints
          .freeOnly,
      ).toBe(false);
    });

    it('does not read "sin salir" or "sin gastar" as refusals', () => {
      expect(intentFor('algo sin salir').constraints.atHome).toBe(true);
      const free = intentFor('algo sin gastar con amigos');
      expect(free.constraints.freeOnly).toBe(true);
      expect(free.unmapped).toEqual([]);
    });

    it('reads having no money as free, not as a refusal', () => {
      for (const text of [
        'No tengo un peso y quiero hacer algo con amigos',
        'no tengo plata y quiero hacer algo con amigos',
        'estoy seco, algo con amigos',
        'algo sin un mango',
      ]) {
        const intent = intentFor(text);
        expect(intent.constraints.freeOnly).toBe(true);
        expect(intent.excludedExperiences).toEqual([]);
        expect(intent.experiences.map(({ key }) => key)).not.toContain('beer');
      }
      expect(intentFor('no tengo problema en salir').constraints.freeOnly).toBe(
        false,
      );
    });

    it('never asks for a budget when the plan must be free', () => {
      expect(
        understandingOf(intentFor('no tengo un peso'), FRIDAY_AFTERNOON)
          .missing,
      ).not.toContain('budget');
    });

    it('goes out first and closes at home when the words say so', () => {
      const intent = intentFor(
        'Quiero comer con amigos y despues hacer algo en mi casa',
      );
      expect(intent.constraints.atHome).toBe(false);
      expect(intent.experiences.map(({ key }) => key)).toEqual([
        'dinner',
        'at_home',
      ]);
      expect(
        buildPlanShape(intent, FRIDAY_AFTERNOON).slots.map(
          (slot) => slot.experiences,
        ),
      ).toEqual([['dinner'], ['at_home']]);
      // Playing at home is the Hogar's games, not bowling.
      expect(
        intentFor('cenar afuera y despues jugar en casa').experiences.map(
          ({ key }) => key,
        ),
      ).toEqual(['dinner', 'home_game']);
      // A dinner at home is still a plan at home.
      expect(intentFor('cena en casa con amigos').constraints.atHome).toBe(
        true,
      );
    });

    it('makes the game free, not the meal, and plays at home when nothing is out', () => {
      const free = intentFor(
        'Quiero comer algo con amigos y despues jugar a algo gratis',
      );
      expect(free.constraints.freeOnly).toBe(false);
      expect(free.experiences.map(({ key }) => key)).toEqual([
        'dinner',
        'home_game',
      ]);
      expect(
        intentFor('Quiero comer algo con amigos y despues jugar a algo')
          .experiences,
      ).toContainEqual({
        key: 'fun',
        required: true,
        anyOf: ['fun', 'sport', 'home_game'],
      });
      // Bowling is bowling: no game at home instead.
      expect(
        intentFor('jugar al bowling con amigos').experiences[0].anyOf,
      ).toBeUndefined();
      // "Jugar al fútbol" is a court, nothing else.
      expect(intentFor('jugar al futbol 5 con amigos').experiences).toEqual([
        { key: 'sport', required: true },
      ]);
    });

    it('keeps the person own starting point apart from a named locality', () => {
      expect(
        intentFor('algo', { latitude: -32.9, longitude: -68.8 }).location
          .origin,
      ).toEqual({ latitude: -32.9, longitude: -68.8 });
      expect(intentFor('algo en Chacras').location.origin).toBeNull();
    });
  });

  describe('occasions', () => {
    it('reads who the plan is for in the catalog vocabulary', () => {
      expect(intentFor('cena con mi novia').occasions).toContain('romantic');
      expect(intentFor('algo con los nenes').occasions).toEqual(
        expect.arrayContaining(['kids']),
      );
      expect(
        intentFor('algo con los chicos', { occasions: ['quiet'] }).occasions,
      ).toContain('quiet');
    });

    it('never reads friends as children', () => {
      expect(
        intentFor('me junto con los chicos a tomar algo').occasions,
      ).not.toContain('kids');
    });

    it('requires who-occasions of an offering and excludes clashes', () => {
      const romantic = { occasions: ['romantic' as const] };
      expect(
        fitsOccasions({ occasions: ['romantic', 'quiet'] }, romantic),
      ).toBe(true);
      expect(fitsOccasions({ occasions: ['friends'] }, romantic)).toBe(false);
      expect(
        fitsOccasions(
          { occasions: ['quiet', 'party'] },
          { occasions: ['quiet'] },
        ),
      ).toBe(true);
      expect(
        fitsOccasions({ occasions: ['party'] }, { occasions: ['quiet'] }),
      ).toBe(false);
      // A place action carries no occasions, and an untagged offering has
      // no evidence either way: its traits decide.
      expect(fitsOccasions({ occasions: undefined }, romantic)).toBe(true);
      expect(fitsOccasions({ occasions: [] }, romantic)).toBe(true);
    });

    it('ranks by the share of requested occasions an offering carries', () => {
      const intent = { occasions: ['friends' as const, 'quiet' as const] };
      expect(occasionMatch({ occasions: ['friends'] }, intent)).toBe(0.5);
      expect(occasionMatch({ occasions: undefined }, intent)).toBe(0);
    });

    it('rejects an offering that does not suit the occasion', () => {
      const intent = intentFor('plan con mi novia');
      expect(
        staticFeasibility(game(1, { occasions: ['kids'] }), intent, 10).reasons,
      ).toContain('occasion_mismatch');
    });
  });

  describe('shape', () => {
    it('closes a free or low-budget plan at home, never a normal outing', () => {
      const free = intentFor('plan gratis con amigos');
      expect(homeMayClose(free)).toBe(true);
      expect(
        buildPlanShape(free, FRIDAY_AFTERNOON).slots.at(-1)?.experiences.at(-1),
      ).toBe('at_home');

      const cheap = intentFor('salir con amigos', {
        partySize: 4,
        budget: 16000,
        sources: {
          budget: 'explicit',
          partySize: 'explicit',
          duration: null,
          location: 'default',
        },
      });
      expect(homeMayClose(cheap)).toBe(true);

      const outing = intentFor('salir a cenar');
      expect(homeMayClose(outing)).toBe(false);
      expect(
        buildPlanShape(outing, FRIDAY_AFTERNOON).slots.flatMap(
          (slot) => slot.experiences,
        ),
      ).not.toContain('at_home');
    });

    it('never makes a free plan a beer or a dinner', () => {
      expect(
        intentFor('plan gratis con amigos').experiences.map(({ key }) => key),
      ).not.toContain('beer');
    });
  });

  describe('feasibility and travel', () => {
    it('treats home as open, never as an approximate place', () => {
      const result = timedFeasibility(game(1), FRIDAY, 22 * 60, 23 * 60);
      expect(result.verdict).toBe('FEASIBLE');
    });

    it('still respects the catalog times of a game', () => {
      expect(
        timedFeasibility(
          game(1, { availableTimesOfDay: ['afternoon'] }),
          FRIDAY,
          22 * 60,
          23 * 60,
        ).reasons,
      ).toContain('time_of_day_mismatch');
    });

    it('measures the leg home from the starting point, zero without one', () => {
      const plaza = placeAction({ latitude: -32.8835, longitude: -68.8458 });
      const located = game(1, { ...START });
      expect(haversineKm(plaza, located)).toBeGreaterThan(0.5);
      expect(haversineKm(plaza, game(2))).toBe(0);
      expect(haversineKm(game(1), game(2))).toBe(0);
    });
  });

  describe('plans', () => {
    it('plans two games at home together, with no travel or caveats', () => {
      const intent = intentFor('noche de juegos en casa con amigos');
      const { shape, bySlot } = rankedSlots(intent, [
        game(1),
        game(2),
        game(3),
      ]);
      const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
      expect(proposals.length).toBeGreaterThan(0);
      const best = proposals[0];
      expect(best.stops).toHaveLength(2);
      expect(
        best.stops.every(({ ranked }) => ranked.candidate.location === 'HOME'),
      ).toBe(true);
      const [narration] = narrate(proposals, intent, FRIDAY_AFTERNOON);
      expect(narration.uncertainties).toEqual([]);
      expect(narration.why).not.toContain('En casa / donde estén');
      expect(narration.why).not.toContain('pocas cuadras');
    });

    it('offers different games in each alternative, all free', () => {
      const intent = intentFor('noche de juegos en casa con amigos');
      const games = Array.from({ length: 8 }, (_, index) => game(index + 1));
      const { shape, bySlot } = rankedSlots(intent, games);
      const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
      expect(proposals).toHaveLength(3);
      const keys = proposals.flatMap(({ stops }) =>
        stops.map(({ ranked }) => ranked.candidate.key),
      );
      expect(new Set(keys).size).toBe(keys.length);
      // Nothing is cheaper than free: no "value" option.
      expect(proposals.map(({ role }) => role)).not.toContain('VALUE');
    });

    it('does not drop group games for a group nobody counted', () => {
      const big = game(1, { minPeople: 4 });
      const uncounted = intentFor('jugar algo en casa con mis amigos');
      expect(staticFeasibility(big, uncounted, 10).reasons).not.toContain(
        'party_size',
      );
      const two = intentFor('jugar algo en casa', {
        partySize: 2,
        sources: {
          budget: null,
          partySize: 'explicit',
          duration: null,
          location: 'default',
        },
      });
      expect(staticFeasibility(big, two, 10).reasons).toContain('party_size');
    });

    it('ranks games for children below the rest unless kids were asked for', () => {
      const intent = intentFor('noche de juegos en casa con 6 personas');
      const rank = (candidate: PlanCandidate) =>
        rankCandidate(
          candidate,
          staticFeasibility(candidate, intent, 10),
          ['home_game'],
          intent,
          EMPTY_PERSONAL_SIGNALS,
          1,
        )!.score;
      expect(
        rank(game(1, { occasions: ['kids', 'family', 'party'] })),
      ).toBeLessThan(rank(game(2, { occasions: ['friends', 'party'] })));
    });

    it('closes a free outing at home, never starts there', () => {
      const intent = intentFor('plan gratis con amigos al aire libre');
      const plaza = placeAction({
        placeKind: 'plaza',
        action: 'walk',
        price: price({ priceKind: 'FREE', priceMin: 0, priceMax: 0 }),
      });
      const { shape, bySlot } = rankedSlots(intent, [plaza, game(1)]);
      const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
      expect(proposals.length).toBeGreaterThan(0);
      expect(
        proposals.some(
          ({ stops }) => stops.at(-1)?.ranked.candidate.location === 'HOME',
        ),
      ).toBe(true);
      for (const proposal of proposals) {
        const home = proposal.stops.map(
          ({ ranked }) => ranked.candidate.location === 'HOME',
        );
        expect(home.indexOf(true)).not.toBe(0);
      }
      // Where the house is, nobody knows: no "todo a pocas cuadras".
      for (const narration of narrate(proposals, intent, FRIDAY_AFTERNOON))
        expect(narration.why).not.toContain('pocas cuadras');
    });
  });

  describe('when nothing out fits', () => {
    /** Out: only a pricey bar; at home: two free games. */
    function engine() {
      const bar = placeAction({
        placeKind: 'bar',
        action: 'drinks',
        price: price({ priceKind: 'FIXED', priceMin: 9000, priceMax: 9000 }),
      });
      return new PlanningEngineService(
        {
          retrieve: jest.fn((_intent: PlanIntent, experiences: string[]) => {
            const candidates = experiences.includes('at_home')
              ? [bar, game(1), game(2)]
              : [bar];
            return Promise.resolve({
              candidates,
              area: null,
              universe: candidates.length,
            });
          }),
        } as unknown as CandidateRetrievalService,
        { verify: jest.fn() } as unknown as LiveVerificationService,
        { load: jest.fn() } as unknown as PersonalSignalsService,
      );
    }
    const budget = (query: string) =>
      intentFor(query, {
        partySize: 4,
        budget: 16000,
        sources: {
          budget: 'text',
          partySize: 'text',
          duration: null,
          location: 'default',
        },
      });

    it('plays at home when there is nowhere to play out', async () => {
      const query = 'quiero tomar algo y despues jugar a algo';
      const result = await new PlanningEngineService(
        {
          retrieve: jest.fn((_intent: PlanIntent, experiences: string[]) => {
            const bar = placeAction({ placeKind: 'bar', action: 'drinks' });
            const candidates = experiences.includes('home_game')
              ? [bar, game(1), game(2)]
              : [bar];
            return Promise.resolve({
              candidates,
              area: null,
              universe: candidates.length,
            });
          }),
        } as unknown as CandidateRetrievalService,
        { verify: jest.fn() } as unknown as LiveVerificationService,
        { load: jest.fn() } as unknown as PersonalSignalsService,
      ).plan({
        intent: intentFor(query),
        rawQuery: query,
        requestedAt: FRIDAY_AFTERNOON,
        idUser: null,
        offline: true,
      });
      expect(result.proposals.length).toBeGreaterThan(0);
      const stops = result.proposals[0].stops;
      expect(stops.at(-1)?.ranked.candidate.location).toBe('HOME');
      expect(stops[0].ranked.candidate.location).not.toBe('HOME');
      expect(result.narrations[0].uncertainties.join()).not.toContain(
        'Falta planificar',
      );
    });

    it('gives "jugar a algo" one kind of game per option, never all in one', async () => {
      const query = 'quiero jugar a algo con amigos';
      const escape = (placeId: number) =>
        placeAction({
          placeId,
          placeKind: 'amusement',
          action: 'amusement',
          key: `p:${placeId}:amusement`,
        });
      const result = await new PlanningEngineService(
        {
          retrieve: jest.fn(() => {
            const candidates = [escape(901), escape(902), game(1), game(2)];
            return Promise.resolve({
              candidates,
              area: null,
              universe: candidates.length,
            });
          }),
        } as unknown as CandidateRetrievalService,
        { verify: jest.fn() } as unknown as LiveVerificationService,
        { load: jest.fn() } as unknown as PersonalSignalsService,
      ).plan({
        intent: intentFor(query),
        rawQuery: query,
        requestedAt: FRIDAY_AFTERNOON,
        idUser: null,
        offline: true,
      });
      const kinds = result.proposals.map((proposal) =>
        proposal.stops.map(
          ({ ranked }) => ranked.candidate.location === 'HOME',
        ),
      );
      // One option at home, one out; none mixes an escape room and a game.
      expect(kinds.some((home) => home.every(Boolean))).toBe(true);
      expect(kinds.some((home) => !home.some(Boolean))).toBe(true);
    });

    it('proposes games at home to a low budget, and says so', async () => {
      const query = 'salir con amigos';
      const result = await engine().plan({
        intent: budget(query),
        rawQuery: query,
        requestedAt: FRIDAY_AFTERNOON,
        idUser: null,
        offline: true,
      });
      expect(result.trace.homeFallback).toBe(true);
      expect(result.proposals.length).toBeGreaterThan(0);
      expect(
        result.proposals[0].stops.every(
          ({ ranked }) => ranked.candidate.location === 'HOME',
        ),
      ).toBe(true);
      expect(result.narrations[0].uncertainties[0]).toContain(
        'te proponemos quedarse en casa',
      );
    });

    it('never turns the close at home into the plan without saying so', async () => {
      const query = 'salir con amigos';
      const result = await new PlanningEngineService(
        {
          retrieve: jest.fn((_intent: PlanIntent, experiences: string[]) => {
            // Nothing out at all for this request; games when asked for.
            const candidates = experiences.includes('at_home')
              ? [game(1), game(2)]
              : [];
            return Promise.resolve({
              candidates,
              area: null,
              universe: candidates.length,
            });
          }),
        } as unknown as CandidateRetrievalService,
        { verify: jest.fn() } as unknown as LiveVerificationService,
        { load: jest.fn() } as unknown as PersonalSignalsService,
      ).plan({
        intent: budget(query),
        rawQuery: query,
        requestedAt: FRIDAY_AFTERNOON,
        idUser: null,
        offline: true,
      });
      expect(result.trace.homeFallback).toBe(true);
      expect(result.narrations[0].uncertainties[0]).toContain(
        'te proponemos quedarse en casa',
      );
    });

    it('never swaps something asked for by name for games at home', async () => {
      const query = 'una cerveza con amigos';
      const result = await engine().plan({
        intent: budget(query),
        rawQuery: query,
        requestedAt: FRIDAY_AFTERNOON,
        idUser: null,
        offline: true,
      });
      expect(result.trace.homeFallback).toBeUndefined();
      expect(
        result.proposals
          .flatMap(({ stops }) => stops)
          .some(({ ranked }) => ranked.candidate.location === 'HOME'),
      ).toBe(false);
    });
  });
});
