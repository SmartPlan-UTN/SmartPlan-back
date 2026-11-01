import {
  estimateFromObservations,
  shouldApplyObservedEstimate,
} from './price-observation';

const NOW = new Date('2026-10-12T00:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const obs = (amountPerPerson: number, days: number) => ({
  amountPerPerson,
  observedAt: daysAgo(days),
});

describe('estimateFromObservations', () => {
  it('returns no estimate below the minimum number of observations', () => {
    expect(
      estimateFromObservations([obs(20000, 3), obs(21000, 5)], { now: NOW }),
    ).toBeNull();
  });

  it('builds a range from recent, consistent reports', () => {
    const result = estimateFromObservations(
      [obs(20000, 3), obs(22000, 10), obs(24000, 20), obs(23000, 30)],
      { now: NOW },
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('RANGE');
    expect(result!.min).toBeGreaterThanOrEqual(20000);
    expect(result!.max).toBeLessThanOrEqual(24000);
    expect(result!.count).toBe(4);
    expect(result!.newestAt).toEqual(daysAgo(3));
  });

  it('ignores stale reports entirely', () => {
    expect(
      estimateFromObservations(
        [obs(10000, 200), obs(11000, 220), obs(12000, 240), obs(30000, 5)],
        { now: NOW },
      ),
    ).toBeNull();
  });

  it('weights recent reports above older ones', () => {
    const result = estimateFromObservations(
      [
        obs(30000, 2),
        obs(30000, 4),
        obs(30000, 6),
        obs(10000, 120),
        obs(10000, 130),
      ],
      { now: NOW },
    );
    expect(result!.min).toBeGreaterThanOrEqual(30000 - 500);
  });

  it('discards an outlier instead of letting it drag the estimate', () => {
    const result = estimateFromObservations(
      [
        obs(20000, 2),
        obs(21000, 4),
        obs(20500, 6),
        obs(21500, 8),
        obs(2000000, 3),
      ],
      { now: NOW },
    );
    expect(result!.max).toBeLessThan(30000);
    expect(result!.count).toBe(4);
  });

  it('never produces a zero or negative amount', () => {
    expect(
      estimateFromObservations([obs(0, 1), obs(-5, 2), obs(0, 3)], {
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('shouldApplyObservedEstimate', () => {
  const estimate = { newestAt: daysAgo(3) };

  it('applies when the price is unknown', () => {
    expect(
      shouldApplyObservedEstimate(
        { priceKind: 'UNKNOWN', priceSource: null, priceVerifiedAt: null },
        estimate,
        NOW,
      ),
    ).toBe(true);
  });

  it('keeps a fresh official price over user reports', () => {
    expect(
      shouldApplyObservedEstimate(
        {
          priceKind: 'FIXED',
          priceSource: 'OFFICIAL',
          priceVerifiedAt: daysAgo(10),
        },
        estimate,
        NOW,
      ),
    ).toBe(false);
  });

  it('lets recent reports replace a stale curated price', () => {
    expect(
      shouldApplyObservedEstimate(
        {
          priceKind: 'FROM',
          priceSource: 'CURATED',
          priceVerifiedAt: daysAgo(240),
        },
        estimate,
        NOW,
      ),
    ).toBe(true);
  });

  it('does not replace a stale price with reports older than it', () => {
    expect(
      shouldApplyObservedEstimate(
        {
          priceKind: 'FROM',
          priceSource: 'CURATED',
          priceVerifiedAt: daysAgo(95),
        },
        { newestAt: daysAgo(120) },
        NOW,
      ),
    ).toBe(false);
  });
});
