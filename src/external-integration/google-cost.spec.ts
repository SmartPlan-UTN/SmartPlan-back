import {
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

  it('costs recorded usage per SKU instead of one flat price', async () => {
    const counts: Record<string, number> = {
      'external-sync': 100,
      'external-sync-search': 10,
      'catalog-match': 0,
      'place-refresh': 20,
    };
    const usage = {
      countSince: jest.fn((contexts: string[]) =>
        Promise.resolve(counts[contexts[0]] ?? 0),
      ),
    };
    const spent = await spentThisMonthUsd(usage, [
      'external-sync',
      'external-sync-search',
      'catalog-match',
      'place-refresh',
    ]);
    // 120 Place Details at 0.025 + 10 Text Searches at 0.04
    expect(spent).toBeCloseTo(120 * 0.025 + 10 * 0.04, 3);
  });

  it('bills every paid usage context as a known SKU', () => {
    expect(GOOGLE_SKU_BY_CONTEXT['place-photo']).toBe('placePhoto');
    expect(GOOGLE_SKU_BY_CONTEXT['ui-kit']).toBe('uiKitQuery');
  });
});
