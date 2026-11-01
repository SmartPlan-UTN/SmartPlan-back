import { computeEligibility, type EligibilityInput } from './eligibility';

const NOW = new Date('2026-10-10T00:00:00Z');

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    status: 'published',
    name: 'Cata de vinos en Luján',
    description: 'Degustación guiada de cuatro vinos con maridaje de quesos.',
    estimatedDuration: 90,
    price: {
      priceKind: 'FIXED',
      priceSource: 'CURATED',
      priceVerifiedAt: new Date('2026-09-20T00:00:00Z'),
    },
    activeCategoryCount: 1,
    occasions: ['romantic', 'quiet'],
    locations: [{ placePublished: true, hasCoordinates: true }],
    ...overrides,
  };
}

describe('computeEligibility', () => {
  it('makes a complete, curated, recently verified activity eligible for everything', () => {
    expect(computeEligibility(input(), { now: NOW })).toEqual({
      discoverable: true,
      planEligible: true,
      autoRecommendEligible: true,
      reasons: [],
    });
  });

  it('keeps an unpublished activity out of everything, whatever else it has', () => {
    const result = computeEligibility(input({ status: 'draft' }), { now: NOW });
    expect(result).toMatchObject({
      discoverable: false,
      planEligible: false,
      autoRecommendEligible: false,
    });
    expect(result.reasons).toContain('not_published');
  });

  it('allows an UNKNOWN price in plans but never in automatic recommendation', () => {
    const result = computeEligibility(
      input({
        price: {
          priceKind: 'UNKNOWN',
          priceSource: null,
          priceVerifiedAt: null,
        },
      }),
      { now: NOW },
    );
    expect(result.discoverable).toBe(true);
    expect(result.planEligible).toBe(true);
    expect(result.autoRecommendEligible).toBe(false);
    expect(result.reasons).toContain('price_unknown');
  });

  it('requires the minimum planning data to be plan eligible', () => {
    const result = computeEligibility(input({ estimatedDuration: null }), {
      now: NOW,
    });
    expect(result.discoverable).toBe(true);
    expect(result.planEligible).toBe(false);
    expect(result.reasons).toContain('no_duration');
  });

  it('is not discoverable without a description', () => {
    const result = computeEligibility(input({ description: '  ' }), {
      now: NOW,
    });
    expect(result.discoverable).toBe(false);
    expect(result.reasons).toContain('no_description');
  });

  it('keeps a short description discoverable but out of automatic recommendation', () => {
    const result = computeEligibility(input({ description: 'Corta' }), {
      now: NOW,
    });
    expect(result).toMatchObject({
      discoverable: true,
      planEligible: true,
      autoRecommendEligible: false,
    });
    expect(result.reasons).toContain('description_too_short');
  });

  it('keeps an at-home activity (no place, no category) discoverable and plannable but not automatic', () => {
    const result = computeEligibility(
      input({ locations: [], activeCategoryCount: 0 }),
      { now: NOW },
    );
    expect(result).toMatchObject({
      discoverable: true,
      planEligible: true,
      autoRecommendEligible: false,
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining(['no_coordinates', 'no_active_category']),
    );
  });

  it('needs SmartPlan-owned coordinates to be planned, not to be discovered', () => {
    const unlocated = computeEligibility(
      input({ locations: [{ placePublished: true, hasCoordinates: false }] }),
      { now: NOW },
    );
    expect(unlocated.discoverable).toBe(true);
    expect(unlocated.planEligible).toBe(false);
    expect(unlocated.autoRecommendEligible).toBe(false);
    expect(unlocated.reasons).toContain('no_persistent_coordinates');

    // A live provider coordinate is enrichment, not the foundation of a plan.
    const providerOnly = computeEligibility(
      input({
        locations: [
          {
            placePublished: true,
            hasCoordinates: true,
            hasPersistentCoordinates: false,
          },
        ],
      }),
      { now: NOW },
    );
    expect(providerOnly.discoverable).toBe(true);
    expect(providerOnly.planEligible).toBe(false);
    expect(providerOnly.reasons).toContain('no_persistent_coordinates');
  });

  it('keeps an activity without places (at home) plannable', () => {
    const result = computeEligibility(input({ locations: [] }), { now: NOW });
    expect(result.planEligible).toBe(true);
    expect(result.reasons).toContain('no_coordinates');
    expect(result.autoRecommendEligible).toBe(false);
  });

  it('never plans an activity whose only place is permanently closed', () => {
    const result = computeEligibility(
      input({
        locations: [
          {
            placePublished: true,
            hasCoordinates: true,
            hasPersistentCoordinates: true,
            closedPermanently: true,
          },
        ],
      }),
      { now: NOW },
    );
    expect(result.discoverable).toBe(true);
    expect(result.planEligible).toBe(false);
    expect(result.reasons).toContain('place_closed');
  });

  it('does not recommend a seasonal activity out of season automatically', () => {
    const winterOnly = input({ availableMonths: [6, 7, 8, 9] });
    // NOW is October.
    const result = computeEligibility(winterOnly, { now: NOW });
    expect(result.planEligible).toBe(true);
    expect(result.autoRecommendEligible).toBe(false);
    expect(result.reasons).toContain('out_of_season');

    const inJuly = computeEligibility(winterOnly, {
      now: new Date('2026-07-15T12:00:00Z'),
    });
    expect(inJuly.autoRecommendEligible).toBe(true);
  });

  it('applies the configured minimum price confidence', () => {
    const legacy = input({
      price: {
        priceKind: 'FIXED',
        priceSource: 'LEGACY',
        priceVerifiedAt: null,
      },
    });
    expect(
      computeEligibility(legacy, { now: NOW, minPriceConfidence: 'LOW' })
        .autoRecommendEligible,
    ).toBe(true);
    const strict = computeEligibility(legacy, {
      now: NOW,
      minPriceConfidence: 'MEDIUM',
    });
    expect(strict.autoRecommendEligible).toBe(false);
    expect(strict.reasons).toContain('price_confidence_low');
  });

  it('drops a curated price from automatic recommendation once it is stale', () => {
    const stale = computeEligibility(
      input({
        price: {
          priceKind: 'FIXED',
          priceSource: 'OFFICIAL',
          priceVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        },
      }),
      { now: NOW },
    );
    expect(stale.planEligible).toBe(true);
    expect(stale.autoRecommendEligible).toBe(false);
    expect(stale.reasons).toContain('price_stale');
  });

  it('accepts an older price for automatic recommendation when the age dial is widened', () => {
    const old = input({
      price: {
        priceKind: 'FROM',
        priceSource: 'CURATED',
        priceVerifiedAt: new Date('2026-02-15T00:00:00Z'),
      },
    });
    expect(computeEligibility(old, { now: NOW }).reasons).toContain(
      'price_stale',
    );
    const widened = computeEligibility(old, {
      now: NOW,
      maxPriceAgeDays: 365,
    });
    expect(widened.autoRecommendEligible).toBe(true);
    expect(widened.reasons).not.toContain('price_stale');
  });

  it('is not discoverable when every place it is tied to is unpublished', () => {
    const result = computeEligibility(
      input({ locations: [{ placePublished: false, hasCoordinates: false }] }),
      { now: NOW },
    );
    expect(result.discoverable).toBe(false);
    expect(result.reasons).toContain('place_not_published');
  });

  describe('occasions and the Hogar', () => {
    const homeGame = (verifiedAt: string) =>
      input({
        price: {
          priceKind: 'FREE',
          priceSource: 'CURATED',
          priceSourceRef: 'https://example.test/reglas',
          priceVerifiedAt: new Date(verifiedAt),
        },
        locations: [
          { placePublished: true, hasCoordinates: false, virtual: true },
        ],
      });

    it('never recommends an activity without occasions automatically', () => {
      const result = computeEligibility(input({ occasions: [] }), {
        now: NOW,
      });
      expect(result.planEligible).toBe(true);
      expect(result.autoRecommendEligible).toBe(false);
      expect(result.reasons).toEqual(['no_occasions']);
    });

    it('treats the Hogar as a located, open place', () => {
      const result = computeEligibility(homeGame('2026-10-01T00:00:00Z'), {
        now: NOW,
      });
      expect(result).toMatchObject({
        planEligible: true,
        autoRecommendEligible: true,
        reasons: [],
      });
    });

    it('keeps a curated free game at home fresh after 200 days', () => {
      const result = computeEligibility(homeGame('2026-03-24T00:00:00Z'), {
        now: NOW,
      });
      expect(result.autoRecommendEligible).toBe(true);
    });

    it('still lets a free museum price go stale after 100 days', () => {
      const result = computeEligibility(
        input({
          price: {
            priceKind: 'FREE',
            priceSource: 'CURATED',
            priceSourceRef: 'https://example.test/museo',
            priceVerifiedAt: new Date('2026-07-02T00:00:00Z'),
          },
        }),
        { now: NOW },
      );
      expect(result.reasons).toContain('price_stale');
    });

    it('lets a free game at home and in a real park go stale like the park', () => {
      const both = homeGame('2026-03-24T00:00:00Z');
      both.locations.push({ placePublished: true, hasCoordinates: true });
      const result = computeEligibility(both, { now: NOW });
      expect(result.reasons).toContain('price_stale');
    });

    it('lets a home game without a rules source go stale', () => {
      const game = homeGame('2026-03-24T00:00:00Z');
      game.price = { ...game.price, priceSourceRef: null };
      expect(computeEligibility(game, { now: NOW }).reasons).toContain(
        'price_stale',
      );
    });
  });
});
