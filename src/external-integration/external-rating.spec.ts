import { visibleExternalPrice, visibleExternalRating } from './external-rating';

const NOW = new Date('2026-10-10T00:00:00Z');

describe('visibleExternalRating', () => {
  it('shows a cached rating with its provider while it is valid', () => {
    expect(
      visibleExternalRating(
        {
          externalRating: 4.6,
          externalRatingCount: 823,
          externalExpiresAt: new Date('2026-10-20T00:00:00Z'),
        },
        NOW,
      ),
    ).toEqual({ rating: 4.6, ratingCount: 823, source: 'google' });
  });

  it('never shows a rating whose cache expired, even before the purge runs', () => {
    expect(
      visibleExternalRating(
        {
          externalRating: 4.6,
          externalRatingCount: 823,
          externalExpiresAt: new Date('2026-09-01T00:00:00Z'),
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('returns null when there is no rating pair', () => {
    expect(
      visibleExternalRating(
        {
          externalRating: null,
          externalRatingCount: null,
          externalExpiresAt: null,
        },
        NOW,
      ),
    ).toBeNull();
  });
});

describe('visibleExternalPrice', () => {
  const base = {
    externalPriceMin: 20000,
    externalPriceMax: 35000,
    externalPriceCurrency: 'ARS',
    externalPriceLevel: null,
    externalExpiresAt: new Date('2026-10-20T00:00:00Z'),
  };

  it('shows a valid cached place-level range with its provider', () => {
    expect(visibleExternalPrice(base, NOW)).toEqual({
      min: 20000,
      max: 35000,
      currency: 'ARS',
      level: null,
      source: 'google',
    });
  });

  it('hides it once the cache expired', () => {
    expect(
      visibleExternalPrice(
        { ...base, externalExpiresAt: new Date('2026-09-01T00:00:00Z') },
        NOW,
      ),
    ).toBeNull();
  });

  it('is null when Google gave no price at all (never a zero)', () => {
    expect(
      visibleExternalPrice(
        {
          ...base,
          externalPriceMin: null,
          externalPriceMax: null,
          externalPriceCurrency: null,
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('keeps a coarse level without inventing an amount', () => {
    expect(
      visibleExternalPrice(
        {
          ...base,
          externalPriceMin: null,
          externalPriceMax: null,
          externalPriceCurrency: null,
          externalPriceLevel: 'PRICE_LEVEL_MODERATE',
        },
        NOW,
      ),
    ).toEqual({
      min: null,
      max: null,
      currency: null,
      level: 'PRICE_LEVEL_MODERATE',
      source: 'google',
    });
  });
});
