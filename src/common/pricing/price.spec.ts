import {
  computePlanTotals,
  describePrice,
  InvalidPriceError,
  isPriceStale,
  legacyEstimatedCost,
  normalizePrice,
  priceConfidence,
  UNKNOWN_PRICE,
} from './price';

describe('normalizePrice', () => {
  it('discards amounts on an UNKNOWN price instead of coercing to zero', () => {
    const price = normalizePrice({
      priceKind: 'UNKNOWN',
      priceMin: 0,
      priceMax: 10,
      priceSource: 'CURATED',
    });
    expect(price).toEqual(UNKNOWN_PRICE);
    expect(legacyEstimatedCost(price)).toBeNull();
  });

  it('keeps FREE as a real zero but requires positive evidence', () => {
    const price = normalizePrice({
      priceKind: 'FREE',
      priceUnit: 'PER_PERSON',
      priceSource: 'OFFICIAL',
    });
    expect(price.priceMin).toBe(0);
    expect(price.priceMax).toBe(0);
    expect(legacyEstimatedCost(price)).toBe(0);
    expect(() =>
      normalizePrice({
        priceKind: 'FREE',
        priceUnit: 'PER_PERSON',
        priceSource: 'PROVIDER_HINT',
      }),
    ).toThrow(InvalidPriceError);
    expect(() =>
      normalizePrice({
        priceKind: 'FREE',
        priceUnit: 'PER_PERSON',
        priceSource: 'LEGACY',
      }),
    ).toThrow(InvalidPriceError);
  });

  it('validates the shape of each known kind', () => {
    expect(
      normalizePrice({
        priceKind: 'FIXED',
        priceMin: 1500,
        priceUnit: 'ENTRY',
        priceSource: 'CURATED',
      }),
    ).toMatchObject({ priceMin: 1500, priceMax: 1500 });
    expect(
      normalizePrice({
        priceKind: 'FROM',
        priceMin: 8000,
        priceUnit: 'PER_PERSON',
        priceSource: 'OFFICIAL',
      }),
    ).toMatchObject({ priceMin: 8000, priceMax: null });
    expect(() =>
      normalizePrice({
        priceKind: 'RANGE',
        priceMin: 5000,
        priceMax: 5000,
        priceUnit: 'PER_PERSON',
        priceSource: 'CURATED',
      }),
    ).toThrow(InvalidPriceError);
    expect(() =>
      normalizePrice({
        priceKind: 'FIXED',
        priceMin: -1,
        priceUnit: 'PER_PERSON',
        priceSource: 'CURATED',
      }),
    ).toThrow(InvalidPriceError);
    expect(() =>
      normalizePrice({ priceKind: 'FIXED', priceMin: 100, priceUnit: 'ENTRY' }),
    ).toThrow(InvalidPriceError);
  });

  it('rejects non-ARS currencies', () => {
    expect(() =>
      normalizePrice({ priceKind: 'UNKNOWN', priceCurrency: 'USD' }),
    ).toThrow(InvalidPriceError);
  });
});

describe('priceConfidence and staleness', () => {
  it('ranks sources OFFICIAL/CURATED > USER_REPORTED > hint/legacy > unknown', () => {
    const conf = (
      priceSource: Parameters<typeof priceConfidence>[0]['priceSource'],
    ) => priceConfidence({ priceKind: 'FIXED', priceSource });
    expect(conf('OFFICIAL')).toBe('HIGH');
    expect(conf('CURATED')).toBe('HIGH');
    expect(conf('USER_REPORTED')).toBe('MEDIUM');
    expect(conf('PROVIDER_HINT')).toBe('LOW');
    expect(conf('LEGACY')).toBe('LOW');
    expect(priceConfidence(UNKNOWN_PRICE)).toBe('NONE');
  });

  it('marks unverified or old known prices as stale, never UNKNOWN', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    expect(
      isPriceStale({ priceKind: 'FIXED', priceVerifiedAt: null }, now),
    ).toBe(true);
    expect(
      isPriceStale(
        {
          priceKind: 'FIXED',
          priceVerifiedAt: new Date('2026-09-20T00:00:00Z'),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isPriceStale(
        {
          priceKind: 'FIXED',
          priceVerifiedAt: new Date('2026-05-01T00:00:00Z'),
        },
        now,
      ),
    ).toBe(true);
    expect(isPriceStale(UNKNOWN_PRICE, now)).toBe(false);
  });
});

describe('computePlanTotals', () => {
  const fixed = (
    amount: number,
    priceUnit: 'PER_PERSON' | 'PER_GROUP' | 'UNSPECIFIED',
  ) => ({
    priceKind: 'FIXED' as const,
    priceMin: amount,
    priceMax: amount,
    priceUnit,
  });

  it('is EXACT 0/0 for an empty plan', () => {
    expect(computePlanTotals([], 2)).toEqual({
      totalMin: 0,
      totalMax: 0,
      unpricedCount: 0,
      completeness: 'EXACT',
    });
  });

  it('multiplies per-person amounts by party size and keeps group amounts', () => {
    const totals = computePlanTotals(
      [
        fixed(1000, 'PER_PERSON'),
        fixed(3000, 'PER_GROUP'),
        fixed(500, 'UNSPECIFIED'),
      ],
      4,
    );
    expect(totals).toMatchObject({
      totalMin: 4000 + 3000 + 500,
      totalMax: 7500,
      completeness: 'EXACT',
    });
  });

  it('keeps FREE at zero and FROM as an open lower bound', () => {
    const totals = computePlanTotals(
      [
        {
          priceKind: 'FREE',
          priceMin: 0,
          priceMax: 0,
          priceUnit: 'PER_PERSON',
        },
        {
          priceKind: 'FROM',
          priceMin: 2000,
          priceMax: null,
          priceUnit: 'PER_PERSON',
        },
      ],
      2,
    );
    expect(totals).toEqual({
      totalMin: 4000,
      totalMax: null,
      unpricedCount: 0,
      completeness: 'LOWER_BOUND',
    });
  });

  it('reports RANGE totals as min/max', () => {
    const totals = computePlanTotals(
      [
        {
          priceKind: 'RANGE',
          priceMin: 1000,
          priceMax: 2000,
          priceUnit: 'PER_PERSON',
        },
        fixed(500, 'PER_PERSON'),
      ],
      2,
    );
    expect(totals).toMatchObject({
      totalMin: 3000,
      totalMax: 5000,
      completeness: 'RANGE',
    });
  });

  it('never counts UNKNOWN as zero: PARTIAL with a count, NONE when nothing is priced', () => {
    const unknown = {
      priceKind: 'UNKNOWN' as const,
      priceMin: null,
      priceMax: null,
      priceUnit: null,
    };
    expect(
      computePlanTotals([fixed(1000, 'PER_GROUP'), unknown, unknown], 3),
    ).toEqual({
      totalMin: 1000,
      totalMax: null,
      unpricedCount: 2,
      completeness: 'PARTIAL',
    });
    expect(computePlanTotals([unknown], 3)).toEqual({
      totalMin: null,
      totalMax: null,
      unpricedCount: 1,
      completeness: 'NONE',
    });
  });
});

describe('describePrice', () => {
  it('never renders UNKNOWN as an amount', () => {
    expect(describePrice(UNKNOWN_PRICE)).toBe('precio no disponible');
    expect(
      describePrice({
        ...UNKNOWN_PRICE,
        priceKind: 'FREE',
        priceMin: 0,
        priceMax: 0,
        priceUnit: 'PER_PERSON',
        priceSource: 'OFFICIAL',
      }),
    ).toBe('gratis');
  });
});
