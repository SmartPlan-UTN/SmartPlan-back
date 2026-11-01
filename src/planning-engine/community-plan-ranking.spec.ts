import { evaluateCommunityItinerary } from './community-plan-ranking';
import {
  intentFor,
  known,
  placeAction,
  price,
  FRIDAY_AFTERNOON,
} from './testing/fixtures';

describe('community itinerary evaluation', () => {
  it('accepts a whole, current, in-budget route that covers the requested experience', () => {
    const intent = intentFor('cena en Ciudad de Mendoza', {
      partySize: 2,
      budget: 50000,
      sources: {
        budget: 'explicit',
        partySize: 'explicit',
        duration: null,
        location: 'text',
      },
    });
    const candidate = placeAction({
      placeId: 82,
      action: 'meal',
      moments: ['dinner'],
      ...known(12000),
      price: price({ priceKind: 'FIXED', priceMin: 12000, priceMax: 12000 }),
    });

    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 82, action: 'meal', order: 1 }],
      candidates: [candidate],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(true);
    expect(result.decisionGrade).toBe(true);
    expect(result.budgetStatus).toBe('WITHIN');
    expect(result.totalMin).toBe(24000);
    expect(result.matchReasons).toContain('covers_experiences');
  });

  it('rejects an itinerary that omits a required part of the request', () => {
    const intent = intentFor('cine y cena en Ciudad de Mendoza');
    const dinner = placeAction({
      placeId: 83,
      action: 'meal',
      moments: ['dinner'],
      ...known(10000),
    });

    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 83, action: 'meal', order: 1 }],
      candidates: [dinner],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(false);
  });

  it('does not treat a historical price as current evidence for a strict budget', () => {
    const intent = intentFor('cena en Ciudad de Mendoza por menos de $50.000', {
      partySize: 2,
      budget: 50000,
      sources: {
        budget: 'text',
        partySize: 'text',
        duration: null,
        location: 'text',
      },
    });
    const stale = placeAction({
      placeId: 84,
      action: 'meal',
      moments: ['dinner'],
      hours: known().hours,
      price: price({
        priceKind: 'FIXED',
        priceMin: 1000,
        priceMax: 1000,
        priceVerifiedAt: new Date('2025-01-01T00:00:00Z'),
      }),
    });

    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 84, action: 'meal', order: 1 }],
      candidates: [stale],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(false);
  });

  it('keeps an itinerary with unknown current hours uncertain rather than presenting it as verified', () => {
    const candidate = placeAction({
      placeId: 87,
      action: 'meal',
      moments: ['dinner'],
      price: price({ priceKind: 'FREE' }),
      hours: null,
    });
    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 87, action: 'meal', order: 1 }],
      candidates: [candidate],
      intent: intentFor('cena tranquila en Ciudad de Mendoza'),
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(true);
    expect(result.decisionGrade).toBe(false);
    expect(result.uncertainties).toContain('hours_unknown');
  });

  it('rejects an itinerary whose total duration exceeds the request', () => {
    const intent = intentFor('cena de 30 minutos en Ciudad de Mendoza', {
      availableDuration: 30,
      sources: {
        budget: null,
        partySize: null,
        duration: 'text',
        location: 'text',
      },
    });
    const dinner = placeAction({
      placeId: 85,
      action: 'meal',
      moments: ['dinner'],
      durationMinutes: 100,
      ...known(10000),
    });

    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 85, action: 'meal', order: 1 }],
      candidates: [dinner],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(false);
  });

  it('never lets a community stop bypass an explicit free-only restriction', () => {
    const intent = intentFor('actividad gratis en Ciudad de Mendoza', {
      sources: {
        budget: null,
        partySize: null,
        duration: null,
        location: 'text',
      },
    });
    intent.constraints.freeOnly = true;
    const paid = placeAction({
      placeId: 86,
      action: 'meal',
      moments: ['dinner'],
      ...known(9000),
    });

    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 86, action: 'meal', order: 1 }],
      candidates: [paid],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(false);
  });

  it('counts the floor of a "from" price against a non-strict budget', () => {
    const intent = intentFor('cena en Ciudad de Mendoza', {
      partySize: 1,
      budget: 50000,
      sources: {
        budget: 'profile',
        partySize: 'explicit',
        duration: null,
        location: 'text',
      },
    });
    const dinner = placeAction({
      placeId: 90,
      action: 'meal',
      moments: ['dinner'],
      hours: known().hours,
      price: price({ priceKind: 'FROM', priceMin: 60000, priceMax: null }),
    });

    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 90, action: 'meal', order: 1 }],
      candidates: [dinner],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(false);
  });

  it('gives a leg without coordinates the same 15 minutes as the ranking', () => {
    const intent = intentFor('museo en Ciudad de Mendoza');
    const first = placeAction({
      placeId: 91,
      placeKind: 'museum',
      action: 'museum_visit',
      ...known(0),
    });
    const second = placeAction({
      placeId: 92,
      placeKind: 'museum',
      action: 'museum_visit',
      latitude: null,
      longitude: null,
      ...known(0),
    });

    const result = evaluateCommunityItinerary({
      stops: [
        { idActivity: null, idPlace: 91, action: 'museum_visit', order: 1 },
        { idActivity: null, idPlace: 92, action: 'museum_visit', order: 2 },
      ],
      candidates: [first, second],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.eligible).toBe(true);
    expect(result.travelMinutes).toBe(15);
    expect(result.stops[1].start - result.stops[0].end).toBe(15);
  });

  it('judges only the option it chose for a stop', () => {
    const intent = intentFor('cena en Ciudad de Mendoza');
    const verified = placeAction({
      placeId: 93,
      action: 'meal',
      moments: ['dinner'],
      ...known(10000),
    });
    const unverified = { ...verified, key: 'p:93:meal:other', hours: null };

    const result = evaluateCommunityItinerary({
      stops: [{ idActivity: null, idPlace: 93, action: 'meal', order: 1 }],
      candidates: [unverified, verified],
      intent,
      requestedAt: FRIDAY_AFTERNOON,
    });

    expect(result.stops[0].candidate).toBe(verified);
    expect(result.uncertainties).not.toContain('hours_unknown');
    expect(result.decisionGrade).toBe(true);
  });

  it('respects "sin comer"', () => {
    const base = intentFor('museo en Ciudad de Mendoza');
    const museum = placeAction({
      placeId: 94,
      placeKind: 'museum',
      action: 'museum_visit',
      ...known(0),
    });
    const dinner = placeAction({
      placeId: 95,
      action: 'meal',
      moments: ['dinner'],
      ...known(10000),
    });
    const evaluate = (intent: typeof base) =>
      evaluateCommunityItinerary({
        stops: [
          { idActivity: null, idPlace: 94, action: 'museum_visit', order: 1 },
          { idActivity: null, idPlace: 95, action: 'meal', order: 2 },
        ],
        candidates: [museum, dinner],
        intent,
        requestedAt: FRIDAY_AFTERNOON,
      });

    expect(evaluate(base).eligible).toBe(true);
    expect(
      evaluate({ ...base, constraints: { ...base.constraints, noFood: true } })
        .eligible,
    ).toBe(false);
  });

  it('keeps a requested dinner in its moment', () => {
    const base = intentFor('cena en Ciudad de Mendoza');
    const dinner = placeAction({
      placeId: 96,
      action: 'meal',
      moments: ['dinner'],
      ...known(10000),
    });
    const evaluate = (startMinutes: number) =>
      evaluateCommunityItinerary({
        stops: [{ idActivity: null, idPlace: 96, action: 'meal', order: 1 }],
        candidates: [dinner],
        intent: { ...base, when: { ...base.when, startMinutes } },
        requestedAt: FRIDAY_AFTERNOON,
      });

    expect(evaluate(21 * 60).eligible).toBe(true);
    expect(evaluate(18 * 60).eligible).toBe(false);
  });
});
