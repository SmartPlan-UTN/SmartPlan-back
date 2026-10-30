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
});
