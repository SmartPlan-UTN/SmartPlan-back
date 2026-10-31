import type { MealMoment } from '../../catalog/place-actionability';
import type { PriceFields } from '../../common/pricing/price';

export type MenuRole = 'main' | 'drink' | 'starter' | 'dessert';
export interface MenuItemFact {
  name: string;
  role: MenuRole;
  amount: number;
  /** How many people this priced item serves, explicitly curated. */
  serves: number;
  moments: MealMoment[];
}
export interface MenuObservation {
  sourceUrl: string;
  observedAt: string;
  sourceUpdatedAt: string | null;
  expiresAt: string;
  contentHash: string;
  items: MenuItemFact[];
}
export interface MealBasket {
  style: 'LIGHT' | 'STANDARD' | 'FULL';
  people: number;
  min: number;
  max: number;
  components: Array<{ role: MenuRole; quantity: number; options: string[] }>;
  sourceUrl: string;
  observedAt: string;
}

/** A bounded consumption example, never a claim about the venue's entire menu. */
export function mealBasket(
  menu: MenuObservation,
  people: number,
  moment: MealMoment,
  style: MealBasket['style'],
  at: Date,
): MealBasket | null {
  if (!Number.isInteger(people) || people < 1 || people > 1000) return null;
  const observed = Date.parse(menu.observedAt);
  const updated = menu.sourceUpdatedAt
    ? Date.parse(menu.sourceUpdatedAt)
    : observed;
  const expires = Date.parse(menu.expiresAt);
  if (
    ![observed, updated, expires].every(Number.isFinite) ||
    observed > at.getTime() ||
    expires <= at.getTime() ||
    updated > observed
  )
    return null;
  const recipe: MenuRole[] = ['main', 'drink'];
  if (style !== 'LIGHT') recipe.push('starter');
  if (style === 'FULL') recipe.push('dessert');
  let min = 0;
  let max = 0;
  const components: MealBasket['components'] = [];
  for (const role of recipe) {
    const choices = menu.items.filter(
      (item) =>
        item.role === role &&
        item.moments.includes(moment) &&
        item.amount > 0 &&
        Number.isFinite(item.amount) &&
        Number.isInteger(item.serves) &&
        item.serves > 0,
    );
    if (!choices.length) return null;
    // A starter is shared between two; mains, drinks and desserts are individual.
    const portions = role === 'starter' ? Math.ceil(people / 2) : people;
    // What people typically order, not the cheapest water against the
    // most expensive bottle: with enough choices, the middle half of the
    // menu (P25–P75) bounds the example; with few, all of them do.
    const priced = choices
      .map((item) => ({
        item,
        cost: Math.ceil(portions / item.serves) * item.amount,
      }))
      .sort((a, b) => a.cost - b.cost);
    const band =
      priced.length >= 4
        ? priced.slice(
            Math.floor((priced.length - 1) * 0.25),
            Math.ceil((priced.length - 1) * 0.75) + 1,
          )
        : priced;
    min += band[0].cost;
    max += band[band.length - 1].cost;
    components.push({
      role,
      quantity: portions,
      options: band.slice(0, 3).map(({ item }) => item.name),
    });
  }
  return {
    style,
    people,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    components,
    sourceUrl: menu.sourceUrl,
    observedAt: menu.observedAt,
  };
}

export function basketPrice(basket: MealBasket): PriceFields {
  return {
    priceKind: 'RANGE',
    priceMin: basket.min,
    priceMax: basket.max,
    priceUnit: 'PER_GROUP',
    priceCurrency: 'ARS',
    priceSource: 'OFFICIAL',
    priceSourceRef: basket.sourceUrl,
    priceVerifiedAt: new Date(basket.observedAt),
  };
}
