import type { MenuItemFact, MenuObservation } from './menu';
import {
  intentBasket,
  menuFeatures,
  menuMatches,
  orderWithin,
  semanticRole,
} from './menu-intelligence';

const AT = new Date('2026-10-17T20:00:00-03:00');

const item = (
  name: string,
  role: MenuItemFact['role'],
  amount: number,
  serves = 1,
): MenuItemFact => ({
  name,
  role,
  amount,
  serves,
  moments: ['dinner'],
});

const menu = (items: MenuItemFact[]): MenuObservation => ({
  sourceUrl: 'https://bar.example/carta',
  observedAt: '2026-10-15T12:00:00Z',
  sourceUpdatedAt: '2026-10-14T12:00:00Z',
  expiresAt: '2026-11-15T12:00:00Z',
  contentHash: 'x',
  items,
});

const BAR = menu([
  item('Pinta IPA', 'drink', 6500),
  item('Pinta Golden', 'drink', 6000),
  item('Pinta Stout', 'drink', 6800),
  item('Fernet con coca', 'drink', 7000),
  item('Gin tonic', 'drink', 8500),
  item('Copa de Malbec', 'drink', 7500),
  item('Agua sin gas', 'drink', 2500),
  item('Papas con cheddar para compartir', 'starter', 12000),
  item('Nachos', 'starter', 11000),
  item('Provoleta', 'starter', 9500),
  item('Hamburguesa doble', 'main', 16000),
  item('Pizza muzzarella', 'main', 14000, 2),
  item('Ojo de bife', 'main', 28000),
  item('Flan casero', 'dessert', 6000),
]);

describe('menu intelligence', () => {
  it('reads semantic roles from the item words within its section', () => {
    expect(semanticRole(item('Pinta IPA', 'drink', 1))).toBe('BEER');
    expect(semanticRole(item('Gin tonic', 'drink', 1))).toBe('COCKTAIL');
    expect(semanticRole(item('Copa de Malbec', 'drink', 1))).toBe('WINE');
    expect(semanticRole(item('Nachos', 'starter', 1))).toBe('SHAREABLE');
    // A sweet word inside a mains section does not make a dessert.
    expect(semanticRole(item('Panqueque de verdura', 'main', 1))).toBe('MAIN');
    // A drink whose words say nothing stays coarse.
    expect(semanticRole(item('Especial de la casa', 'drink', 1))).toBeNull();
  });

  it('builds a beer-with-friends order from real pints and shared food', () => {
    const basket = intentBasket(
      BAR,
      { people: 4, experience: 'beer', occasion: 'friends', style: 'STANDARD' },
      AT,
    )!;
    expect(basket.name).toMatch(/pintas/i);
    const beer = basket.suggestion.lines[0];
    expect(beer.quantity).toBe(8); // two rounds for four
    expect(beer.item).toMatch(/Pinta/);
    expect(basket.suggestion.lines[1].label).toBe('para compartir');
    expect(basket.min).toBeLessThanOrEqual(basket.suggestion.total);
    expect(basket.suggestion.total).toBeLessThanOrEqual(basket.max);
  });

  it('builds a romantic dinner with one shared starter and wine', () => {
    const basket = intentBasket(
      BAR,
      {
        people: 2,
        experience: 'dinner',
        moment: 'dinner',
        occasion: 'romantic',
        style: 'FULL',
      },
      AT,
    )!;
    const labels = basket.suggestion.lines.map((line) => line.label);
    expect(labels).toEqual([
      'entrada para compartir',
      'principal por persona',
      'bebida por persona',
      'postre para compartir',
    ]);
    expect(basket.suggestion.lines[0].quantity).toBe(1);
    expect(basket.suggestion.lines[2].item).toMatch(/Malbec/);
  });

  it('never prices a stale menu or a missing required component', () => {
    expect(
      intentBasket(
        { ...BAR, expiresAt: '2026-10-01T00:00:00Z' },
        {
          people: 2,
          experience: 'dinner',
          moment: 'dinner',
          occasion: null,
          style: 'STANDARD',
        },
        AT,
      ),
    ).toBeNull();
    expect(
      intentBasket(
        BAR,
        {
          people: 2,
          experience: 'merienda',
          occasion: null,
          style: 'STANDARD',
        },
        AT,
      ),
    ).toBeNull();
  });

  it('answers "qué podemos pedir con $X" with a real order that fits', () => {
    const fits = orderWithin(
      BAR,
      { people: 2, experience: 'dinner', moment: 'dinner', occasion: null },
      60000,
      AT,
    )!;
    expect(fits.suggestion.total).toBeLessThanOrEqual(60000);
    expect(
      orderWithin(
        BAR,
        { people: 2, experience: 'dinner', moment: 'dinner', occasion: null },
        5000,
        AT,
      ),
    ).toBeNull();
  });

  it('derives factual features and dish matches', () => {
    const traits = menuFeatures(BAR).map((t) => t.trait);
    expect(traits).not.toContain('romantic');
    expect(menuMatches(BAR, ['hamburguesa'])).toBe(1);
    expect(menuMatches(BAR, ['sushi'])).toBe(0);
  });
});
