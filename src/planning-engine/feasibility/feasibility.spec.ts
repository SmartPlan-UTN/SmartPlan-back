import { intentFor, placeAction, price } from '../testing/fixtures';
import { staticFeasibility, timedFeasibility } from './feasibility';

const OCTOBER = 10;
const FRIDAY = 5;

describe('feasibility before ranking', () => {
  it('keeps offering time restrictions even when the venue is open all day', () => {
    const morningOffering = placeAction({
      kind: 'OFFERING',
      activityId: 10,
      availableTimesOfDay: ['morning'],
      hours: {
        weekly: Array.from({ length: 7 }, () => [[480, 1440] as const]),
        source: 'OFFICIAL',
        verifiedAt: new Date(),
      },
    });
    expect(
      timedFeasibility(morningOffering, FRIDAY, 21 * 60, 22 * 60),
    ).toMatchObject({
      verdict: 'INFEASIBLE',
      reasons: ['time_of_day_mismatch'],
    });
    expect(
      timedFeasibility(morningOffering, FRIDAY, 9 * 60, 10 * 60).verdict,
    ).toBe('FEASIBLE');
  });

  it('excludes gambling venues from a family outing', () => {
    const casino = placeAction({
      traits: [
        {
          trait: 'family_friendly',
          score: -1,
          source: 'NAME',
          confidence: 0.8,
        },
      ],
    });
    expect(
      staticFeasibility(casino, intentFor('una salida familiar'), OCTOBER)
        .reasons,
    ).toContain('not_kid_friendly');
  });
  it('rejects a travel agency as a direct stop', () => {
    const agency = placeAction({
      placeKind: 'tour_operator',
      action: 'day_trip',
    });
    const result = staticFeasibility(agency, intentFor('salir'), OCTOBER);
    expect(result.verdict).toBe('INFEASIBLE');
    expect(result.reasons).toContain('not_a_stop');
  });

  it('rejects a winery without a verified offering', () => {
    const winery = placeAction({ placeKind: 'winery', action: 'tasting' });
    expect(
      staticFeasibility(winery, intentFor('bodega'), OCTOBER).reasons,
    ).toContain('offering_required');
  });

  it('rejects a known price above a strict budget, keeps an unknown one as uncertain', () => {
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
    const expensive = placeAction({
      price: price({ priceKind: 'FIXED', priceMin: 15000, priceMax: 15000 }),
    });
    expect(staticFeasibility(expensive, intent, OCTOBER)).toMatchObject({
      verdict: 'INFEASIBLE',
      reasons: ['over_budget'],
    });
    // Unknown is never free and never silently feasible.
    expect(staticFeasibility(placeAction(), intent, OCTOBER)).toEqual({
      verdict: 'UNCERTAIN',
      reasons: ['price_unknown'],
    });
  });

  it('requires evidence of free for "gratis"', () => {
    const intent = intentFor('algo gratis');
    expect(staticFeasibility(placeAction(), intent, OCTOBER).reasons).toContain(
      'not_free',
    );
    const plaza = placeAction({
      placeKind: 'plaza',
      price: price({
        priceKind: 'FREE',
        priceMin: 0,
        priceMax: 0,
        priceUnit: 'PER_GROUP',
      }),
    });
    expect(staticFeasibility(plaza, intent, OCTOBER).verdict).toBe('FEASIBLE');
  });

  it('keeps outdoor-only places out of a rainy-day plan', () => {
    const park = placeAction({ placeKind: 'park' });
    expect(
      staticFeasibility(park, intentFor('algo para hacer si llueve'), OCTOBER)
        .reasons,
    ).toContain('not_indoor');
  });

  it('rejects confirmed closed at arrival and accepts confirmed open', () => {
    const weekly = [0, 1, 2, 3, 4, 5, 6].map(() => [
      [12 * 60, 16 * 60] as const,
    ]);
    const lunchOnly = placeAction({
      hours: { weekly, source: 'OFFICIAL', verifiedAt: new Date() },
    });
    expect(
      timedFeasibility(lunchOnly, FRIDAY, 21 * 60, 22 * 60 + 40).reasons,
    ).toContain('closed_at_arrival');
    expect(
      timedFeasibility(lunchOnly, FRIDAY, 13 * 60, 14 * 60 + 40).verdict,
    ).toBe('FEASIBLE');
    expect(
      timedFeasibility(lunchOnly, FRIDAY, 15 * 60, 16 * 60 + 5),
    ).toMatchObject({
      verdict: 'INFEASIBLE',
      reasons: ['closes_during_stop'],
    });
  });

  it('handles hours that cross midnight', () => {
    const lateBar = placeAction({
      placeKind: 'bar',
      hours: {
        weekly: [0, 1, 2, 3, 4, 5, 6].map(() => [[20 * 60, 26 * 60] as const]),
        source: 'SCHEMA_ORG',
        verifiedAt: new Date(),
      },
    });
    // Saturday 00:30 is still Friday's opening.
    expect(
      timedFeasibility(lateBar, FRIDAY, 24 * 60 + 30, 25 * 60 + 30).verdict,
    ).toBe('FEASIBLE');
  });

  it('never claims unknown hours are open: plausible is UNCERTAIN, implausible is rejected', () => {
    const cafe = placeAction({ placeKind: 'cafe' });
    expect(timedFeasibility(cafe, FRIDAY, 17 * 60, 18 * 60)).toEqual({
      verdict: 'UNCERTAIN',
      reasons: ['hours_unknown'],
    });
    expect(
      timedFeasibility(cafe, FRIDAY, 23 * 60 + 30, 24 * 60 + 30).verdict,
    ).toBe('INFEASIBLE');
  });
});
