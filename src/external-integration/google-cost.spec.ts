import {
  GoogleBudgetTracker,
  trustedFreeRequests,
  effectiveMonthlyCap,
  GOOGLE_FREE_MONTHLY_REQUESTS,
  GOOGLE_SKU_BY_CONTEXT,
  PHOTO_MONTHLY_HARD_CAP,
  spentThisMonthUsd,
  UI_KIT_MONTHLY_HARD_CAP,
} from './google-cost';

describe('google cost guards', () => {
  it('keeps the USD 0 photo caps below the free allowances', () => {
    expect(PHOTO_MONTHLY_HARD_CAP).toBeLessThan(
      GOOGLE_FREE_MONTHLY_REQUESTS.placePhoto!,
    );
    expect(UI_KIT_MONTHLY_HARD_CAP).toBeLessThan(
      GOOGLE_FREE_MONTHLY_REQUESTS.uiKitQuery!,
    );
  });

  it('only lets configuration lower a cap, never raise it', () => {
    expect(effectiveMonthlyCap(undefined, 900)).toBe(900);
    expect(effectiveMonthlyCap(100, 900)).toBe(100);
    expect(effectiveMonthlyCap(5000, 900)).toBe(900);
    expect(effectiveMonthlyCap(-3, 900)).toBe(0);
    expect(effectiveMonthlyCap(Number.NaN, 900)).toBe(900);
  });

  function counter(counts: Record<string, number>) {
    return {
      countSince: jest.fn((contexts: string[]) =>
        Promise.resolve(counts[contexts[0]] ?? 0),
      ),
    };
  }

  it('costs usage per SKU, after the trusted share of each free allowance', async () => {
    const usage = counter({
      'external-sync': 700,
      'place-refresh': 200, // 900 Place Details: 800 trusted free -> 100 paid
      'catalog-match': 850, // 850 Text Searches: 800 trusted free -> 50 paid
      'catalog-match-pro': 1000, // well inside 4,000 trusted free
    });
    const spent = await spentThisMonthUsd(usage, [
      'external-sync',
      'external-sync-search',
      'catalog-match',
      'catalog-match-pro',
      'place-refresh',
    ]);
    expect(spent).toBeCloseTo(100 * 0.025 + 50 * 0.04, 3);
    expect(trustedFreeRequests('textSearchPro')).toBe(4000);
  });

  it('lets a pass run free requests, then paid ones up to the budget, then stops', async () => {
    const tracker = await GoogleBudgetTracker.create(
      counter({ 'catalog-match-pro': 3999 }),
      0.07,
    );
    expect(tracker.marginalCost('textSearchPro')).toBe(0);
    expect(tracker.tryCharge('textSearchPro')).toBe(true); // the 4,000th: free
    expect(tracker.marginalCost('textSearchPro')).toBeCloseTo(0.032, 3);
    expect(tracker.tryCharge('textSearchPro')).toBe(true); // paid
    expect(tracker.tryCharge('textSearchPro')).toBe(true); // paid
    expect(tracker.tryCharge('textSearchPro')).toBe(false); // over budget
    expect(tracker.remaining).toBeCloseTo(0.006, 3);
  });

  it('never lets photo or UI Kit usage spend the catalog budget', async () => {
    const tracker = await GoogleBudgetTracker.create(
      counter({ 'place-photo': 5000, 'ui-kit': 50000 }),
      25,
    );
    expect(tracker.remaining).toBe(25);
  });

  it('bills every paid usage context as a known SKU', () => {
    expect(GOOGLE_SKU_BY_CONTEXT['place-photo']).toBe('placePhoto');
    expect(GOOGLE_SKU_BY_CONTEXT['ui-kit']).toBe('uiKitQuery');
  });
});
