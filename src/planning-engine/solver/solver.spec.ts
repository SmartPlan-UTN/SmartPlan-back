import type { PlanCandidate } from '../candidate';
import { staticFeasibility } from '../feasibility/feasibility';
import type { PlanIntent } from '../intent/plan-intent';
import { narrate } from '../narration/narration';
import {
  EMPTY_PERSONAL_SIGNALS,
  rankCandidate,
  type RankedCandidate,
} from '../ranking/ranking';
import { buildPlanShape } from '../shape/plan-shape';
import {
  FRIDAY_AFTERNOON,
  intentFor,
  placeAction,
  known,
  price,
} from '../testing/fixtures';
import { haversineKm, solve } from './solver';

function rankedSlots(intent: PlanIntent, candidates: PlanCandidate[]) {
  const shape = buildPlanShape(intent, FRIDAY_AFTERNOON);
  const bySlot = new Map<string, RankedCandidate[]>();
  for (const slot of shape.slots) {
    const list = candidates
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
      .sort((a, b) => b.score - a.score);
    bySlot.set(slot.id, list);
  }
  return { shape, bySlot };
}

/** Restaurants spread a few blocks apart around the centre. */
function restaurants(count: number): PlanCandidate[] {
  return Array.from({ length: count }, (_, index) =>
    placeAction({
      placeId: 100 + index,
      latitude: -32.8895 + index * 0.002,
      longitude: -68.8458,
    }),
  );
}

describe('solve', () => {
  it('does not label nearby restaurants with the same itinerary as a different kind of plan', () => {
    const intent = intentFor('Quiero salir a comer');
    const { shape, bySlot } = rankedSlots(intent, restaurants(3));
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals).toHaveLength(3);
    expect(proposals.map((proposal) => proposal.role)).toEqual([
      'BEST',
      'ALTERNATIVE',
      'ALTERNATIVE',
    ]);
  });

  it('reserves the different label for a materially different area or itinerary', () => {
    const intent = intentFor('Quiero salir a comer');
    const { shape, bySlot } = rankedSlots(intent, [
      ...restaurants(2),
      placeAction({ placeId: 999, latitude: -32.95 }),
    ]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals.some((proposal) => proposal.role === 'DIFFERENT')).toBe(
      true,
    );
  });

  it('builds a dinner outing with a nearby dessert even when its evidence needs confirmation', () => {
    const intent = intentFor('Quiero salir a comer');
    const { shape, bySlot } = rankedSlots(intent, [
      placeAction({ placeId: 101, ...known(12000) }),
      placeAction({
        placeId: 102,
        placeKind: 'ice_cream',
        action: 'dessert',
        latitude: -32.8901,
      }),
    ]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals[0].stops.map((stop) => stop.experience)).toEqual([
      'dinner',
      'dessert',
    ]);
    expect(proposals[0].stops[1].feasibility.reasons).toEqual(
      expect.arrayContaining(['hours_unknown', 'price_unknown']),
    );
    expect(proposals[0].decisionGrade).toBe(false);
    expect(proposals[0].totals.unpricedCount).toBe(1);
    const narration = narrate(proposals, intent, FRIDAY_AFTERNOON)[0];
    expect(narration.uncertainties.join(' ')).toMatch(/confirmar/i);
    const [dinner, dessert] = proposals[0].stops;
    expect(dessert.start).toBeGreaterThanOrEqual(
      dinner.end + dessert.travelMinutesFromPrevious,
    );
  });

  it('rejects a closed dessert instead of adding a stop to fill the itinerary', () => {
    const intent = intentFor('Quiero salir a comer');
    const { shape, bySlot } = rankedSlots(intent, [
      placeAction({ placeId: 101, ...known() }),
      placeAction({
        placeId: 102,
        placeKind: 'ice_cream',
        action: 'dessert',
        ...known(),
        hours: {
          weekly: Array.from({ length: 7 }, () => [[9 * 60, 18 * 60]]),
          source: 'OFFICIAL',
          verifiedAt: FRIDAY_AFTERNOON,
        },
      }),
    ]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals[0].stops).toHaveLength(1);
  });

  it('keeps a short dinner within the explicit duration instead of forcing an extra stop', () => {
    const intent = intentFor('Quiero salir a comer', {
      availableDuration: 120,
    });
    const { shape, bySlot } = rankedSlots(intent, [
      placeAction({ placeId: 101, durationMinutes: 100, ...known() }),
      placeAction({
        placeId: 102,
        placeKind: 'ice_cream',
        action: 'dessert',
        durationMinutes: 45,
        ...known(),
      }),
    ]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals[0].stops).toHaveLength(1);
    expect(proposals[0].end - proposals[0].start).toBeLessThanOrEqual(120);
  });

  it('shortens an inferred day itinerary to the available time without dropping requested experiences', () => {
    const intent = intentFor('mañana un dia chill con los panas', {
      availableDuration: 240,
    });
    const { shape, bySlot } = rankedSlots(intent, [
      placeAction({
        placeId: 101,
        placeKind: 'park',
        action: 'walk',
        durationMinutes: 60,
        ...known(0),
      }),
      placeAction({ placeId: 102, durationMinutes: 100, ...known() }),
      placeAction({
        placeId: 103,
        placeKind: 'ice_cream',
        action: 'dessert',
        durationMinutes: 120,
        ...known(),
      }),
    ]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals[0].stops.map((stop) => stop.experience)).toEqual([
      'walk',
      'lunch',
    ]);
    expect(proposals[0].end - proposals[0].start).toBeLessThanOrEqual(240);
  });

  it.each(['una birra con amigos', 'un lugar fachero para tomar algo'])(
    'does not append an unrequested meal to %s',
    (query) => {
      const shape = buildPlanShape(intentFor(query), FRIDAY_AFTERNOON);
      expect(shape.slots).toHaveLength(1);
      expect(shape.slots[0].role).toBe('ANCHOR');
      expect(
        shape.slots[0].experiences.some(
          (key) => key === 'beer' || key === 'drinks',
        ),
      ).toBe(true);
    },
  );

  it('keeps a requested sweet stop after the movie', () => {
    const intent = intentFor('cine y después algo dulce');
    const shape = buildPlanShape(intent, FRIDAY_AFTERNOON);
    expect(intent.experiences.map((experience) => experience.key)).toEqual([
      'movie',
      'dessert',
    ]);
    expect(
      shape.slots
        .filter((slot) => slot.required)
        .map((slot) => slot.experiences),
    ).toEqual([['movie'], ['dessert']]);
  });

  it('does not turn cinema now into a screening hours later', () => {
    const intent = intentFor('cine ahora');
    const screening = (fixedStart: number) =>
      placeAction({
        kind: 'SCREENING',
        placeKind: 'cinema',
        action: 'movie_screening',
        fixedStart,
        durationMinutes: 120,
        price: price({ priceKind: 'FIXED', priceMin: 18800, priceMax: 18800 }),
      });
    const later = rankedSlots(intent, [screening(20 * 60)]);
    expect(
      solve({ shape: later.shape, intent, candidatesBySlot: later.bySlot })
        .proposals,
    ).toHaveLength(0);
    const soon = rankedSlots(intent, [screening(15 * 60 + 45)]);
    expect(
      solve({ shape: soon.shape, intent, candidatesBySlot: soon.bySlot })
        .proposals.length,
    ).toBeGreaterThan(0);
  });

  it('uses quarter-hour meeting times without overlapping travel', () => {
    const intent = intentFor('cena romántica');
    const candidates = [
      ...restaurants(2),
      placeAction({
        placeKind: 'bar',
        action: 'drinks',
        placeId: 401,
        latitude: -32.8901,
        // Optional extras must be decision-grade.
        ...known(),
      }),
      placeAction({
        placeKind: 'ice_cream',
        action: 'dessert',
        placeId: 402,
        latitude: -32.8903,
        ...known(),
      }),
    ];
    const { shape, bySlot } = rankedSlots(intent, candidates);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals.some((proposal) => proposal.stops.length > 1)).toBe(true);
    for (const proposal of proposals)
      for (const [index, stop] of proposal.stops.entries()) {
        expect(stop.start % 15).toBe(0);
        if (index > 0)
          expect(stop.start).toBeGreaterThanOrEqual(
            proposal.stops[index - 1].end + stop.travelMinutesFromPrevious,
          );
      }
  });

  it('keeps a one-venue outing as a valid single-stop plan when no companion fits', () => {
    const intent = intentFor('una cena romántica');
    const { shape, bySlot } = rankedSlots(intent, restaurants(1));
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });

    expect(proposals).toHaveLength(1);
    expect(proposals[0].stops).toHaveLength(1);
    expect(proposals[0].stops[0].slotRole).toBe('ANCHOR');
  });

  it('does not measure real distance between department-centre placeholders', () => {
    const approximate = placeAction({ location: 'APPROXIMATE' });
    expect(haversineKm(approximate, placeAction())).toBeNull();
  });
  it('does not add an optional stop whose connection to dinner is unknown', () => {
    const intent = intentFor('cena romántica con poco traslado');
    const { shape, bySlot } = rankedSlots(intent, [
      ...restaurants(3),
      placeAction({
        placeKind: 'bar',
        action: 'drinks',
        location: 'APPROXIMATE',
      }),
    ]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals).toHaveLength(3);
    expect(
      proposals.every((proposal) =>
        proposal.stops.every(
          (stop) => stop.ranked.candidate.location !== 'APPROXIMATE',
        ),
      ),
    ).toBe(true);
  });
  it('builds three options with no shared place and a real timeline', () => {
    const intent = intentFor('salir a comer con amigos');
    const bars = Array.from({ length: 3 }, (_, index) =>
      placeAction({
        placeKind: 'bar',
        placeId: 300 + index,
        latitude: -32.8895 + index * 0.002,
        longitude: -68.846,
      }),
    );
    const { shape, bySlot } = rankedSlots(intent, [...restaurants(4), ...bars]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });

    expect(proposals).toHaveLength(3);
    const places = proposals.flatMap((proposal) =>
      proposal.stops.map((stop) => stop.ranked.candidate.placeId),
    );
    expect(new Set(places).size).toBe(places.length);
    for (const proposal of proposals) {
      expect(proposal.stops[0].start).toBe(21 * 60);
      for (let index = 1; index < proposal.stops.length; index += 1)
        expect(proposal.stops[index].start).toBeGreaterThanOrEqual(
          proposal.stops[index - 1].end,
        );
    }
    expect(proposals.map((proposal) => proposal.role)[0]).toBe('BEST');
  });

  it('never exceeds a strict budget with known prices', () => {
    const intent = intentFor('cena', {
      budget: 20000,
      partySize: 2,
      sources: {
        budget: 'text',
        partySize: 'text',
        duration: null,
        location: 'default',
      },
    });
    const pricey = placeAction({
      placeId: 1,
      price: price({ priceKind: 'FROM', priceMin: 12000 }),
    });
    const affordable = placeAction({
      placeId: 2,
      price: price({ priceKind: 'FROM', priceMin: 8000 }),
    });
    const { shape, bySlot } = rankedSlots(intent, [pricey, affordable]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals)
      expect(proposal.totals.totalMin ?? 0).toBeLessThanOrEqual(20000);
    expect(
      proposals.some((proposal) =>
        proposal.stops.some((stop) => stop.ranked.candidate.placeId === 1),
      ),
    ).toBe(false);
  });

  it('never anchors an unrelated plan on a generic plaza', () => {
    const intent = intentFor('cena');
    const plaza = placeAction({
      placeKind: 'plaza',
      placeId: 9,
      action: 'walk',
      price: price({
        priceKind: 'FREE',
        priceMin: 0,
        priceMax: 0,
        priceUnit: 'PER_GROUP',
      }),
    });
    const { shape, bySlot } = rankedSlots(intent, [plaza, ...restaurants(2)]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    for (const proposal of proposals)
      for (const stop of proposal.stops)
        expect(stop.ranked.candidate.connective).toBe(false);
  });

  it('never calls an unpriced plan cheaper', () => {
    const intent = intentFor('cena');
    const priced = placeAction({
      placeId: 1,
      price: price({ priceKind: 'FROM', priceMin: 30000 }),
    });
    const { shape, bySlot } = rankedSlots(intent, [priced, ...restaurants(3)]);
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    const narrations = narrate(proposals, intent, FRIDAY_AFTERNOON);
    for (const narration of narrations)
      expect(narration.difference ?? '').not.toMatch(/menos\b.*\$|\$.*menos/);
    expect(
      proposals.find((proposal) => proposal.role === 'VALUE'),
    ).toBeUndefined();
  });

  it.each(['FROM', 'RANGE'] as const)(
    'does not claim savings from %s prices without separated bounds',
    (kind) => {
      const intent = intentFor('cena');
      const candidates = restaurants(2).map((candidate, index) => ({
        ...candidate,
        price: price({
          priceKind: kind,
          priceMin: index === 0 ? 30000 : 10000,
          priceMax: kind === 'FROM' ? null : index === 0 ? 40000 : 35000,
        }),
      }));
      const { shape, bySlot } = rankedSlots(intent, candidates);
      const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
      expect(proposals.length).toBeGreaterThan(1);
      expect(proposals.some((proposal) => proposal.role === 'VALUE')).toBe(
        false,
      );
      for (const narration of narrate(proposals, intent, FRIDAY_AFTERNOON))
        expect(narration.difference ?? '').not.toMatch(/\$.*menos/);
    },
  );

  it('keeps an uncertain stop visible in the explanation', () => {
    const intent = intentFor('cena');
    const { shape, bySlot } = rankedSlots(intent, restaurants(1));
    const { proposals } = solve({ intent, shape, candidatesBySlot: bySlot });
    const [narration] = narrate(proposals, intent, FRIDAY_AFTERNOON);
    expect(narration.uncertainties.join(' ')).toMatch(/Horario sin confirmar/);
    expect(narration.uncertainties.join(' ')).toMatch(/Precio sin confirmar/);
  });
});
