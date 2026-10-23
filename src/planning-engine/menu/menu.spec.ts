import { basketPrice, mealBasket } from './menu';
import { observeSchemaMenu, type MenuSource } from './schema-menu';

const at = new Date('2026-10-16T18:00:00Z');
const source: MenuSource = {
  placeId: 1,
  sourceUrl: 'https://restaurant.example/menu',
  retention: 'OWNED',
  currentAsOf: '2026-10-16T12:00:00Z',
  refreshDays: 14,
  sections: {
    Mains: { role: 'main', serves: 1, moments: ['dinner'] },
    Drinks: { role: 'drink', serves: 1, moments: ['dinner'] },
    Starters: { role: 'starter', serves: 1, moments: ['dinner'] },
  },
};
function capture(
  amount: unknown = '20000',
  currency = 'ARS',
  modified?: string,
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    hasMenu: {
      '@type': 'Menu',
      dateModified: modified,
      hasMenuSection: (
        [
          ['Mains', amount],
          ['Drinks', '3000'],
          ['Starters', '8000'],
        ] as Array<[string, unknown]>
      ).map(([name, cost]) => ({
        '@type': 'MenuSection',
        name,
        hasMenuItem: {
          '@type': 'MenuItem',
          name: `${name} example`,
          offers: { '@type': 'Offer', price: cost, priceCurrency: currency },
        },
      })),
    },
  });
}

describe('official menu observations and consumption estimates', () => {
  it('builds group ranges from explicitly priced dishes and portions', () => {
    const menu = observeSchemaMenu(capture(), source, at);
    menu.items.push({
      name: 'Second main',
      role: 'main',
      amount: 25000,
      serves: 1,
      moments: ['dinner'],
    });
    const basket = mealBasket(menu, 2, 'dinner', 'STANDARD', at)!;
    expect(basket).toMatchObject({ min: 54000, max: 64000, people: 2 });
    expect(basketPrice(basket)).toMatchObject({
      priceUnit: 'PER_GROUP',
      priceMin: 54000,
      priceMax: 64000,
      priceSourceRef: source.sourceUrl,
    });
    expect(mealBasket(menu, 3, 'dinner', 'STANDARD', at)?.min).toBe(85000);
  });
  it('keeps incomplete meals and other meal moments unknown', () => {
    const menu = observeSchemaMenu(capture(), source, at);
    expect(mealBasket(menu, 2, 'lunch', 'LIGHT', at)).toBeNull();
    expect(mealBasket(menu, 2, 'dinner', 'FULL', at)).toBeNull();
    menu.items = menu.items.filter((item) => item.role !== 'drink');
    expect(mealBasket(menu, 2, 'dinner', 'LIGHT', at)).toBeNull();
  });
  it('does not confuse observation time with source freshness', () => {
    expect(() =>
      observeSchemaMenu(capture('20000', 'ARS', '2026-07-01'), source, at),
    ).toThrow(/stale/);
    const menu = observeSchemaMenu(capture(), source, at);
    expect(
      mealBasket(menu, 2, 'dinner', 'LIGHT', new Date('2026-11-01')),
    ).toBeNull();
    expect(menu.contentHash).toHaveLength(64);
    expect(
      observeSchemaMenu(capture('21000'), source, at).contentHash,
    ).not.toBe(menu.contentHash);
  });
  it('rejects unreviewed retention, foreign currency and ambiguous formatted amounts', () => {
    expect(() =>
      observeSchemaMenu(
        capture(),
        { ...source, retention: 'ODBL' as never },
        at,
      ),
    ).toThrow(/retention/);
    expect(() =>
      observeSchemaMenu(capture('20000', 'USD'), source, at),
    ).toThrow(/No current/);
    const menu = observeSchemaMenu(capture('20.000'), source, at);
    expect(menu.items.some((item) => item.role === 'main')).toBe(false);
    expect(mealBasket(menu, 2, 'dinner', 'LIGHT', at)).toBeNull();
  });
});
