/**
 * Menu intelligence: what a person could actually order at a venue, from
 * its current published menu. Never an average of the menu, never an
 * invented item, price or portion.
 *
 * - Semantic roles (STARTER, MAIN, BEER, COCKTAIL, COFFEE, …) come from the
 *   item's own words, falling back to the reviewed coarse section role; an
 *   item whose words say nothing stays in its coarse role only.
 * - Baskets follow the INTENT: "cerveza con amigos" is shared food and
 *   pints, "cena romántica" a starter, two mains and wine, a merienda coffee
 *   and something sweet.
 * - Bounds use the middle half of each component's real prices; the
 *   suggestion is one representative real item per component.
 */
import type { MealMoment } from '../../catalog/place-actionability';
import type { TraitEvidence } from '../candidate';
import type { ExperienceKey } from '../intent/experiences';
import type { Occasion } from '../intent/plan-intent';
import type { MenuItemFact, MenuObservation, MenuRole } from './menu';
import { normalizeSearchText } from '../../recommendation/local-intent';

export type SemanticRole =
  | 'STARTER'
  | 'SHAREABLE'
  | 'MAIN'
  | 'SIDE'
  | 'DESSERT'
  | 'BREAKFAST'
  | 'BRUNCH'
  | 'COFFEE'
  | 'PASTRY'
  | 'SOFT_DRINK'
  | 'BEER'
  | 'WINE'
  | 'COCKTAIL';

const ROLE_WORDS: [RegExp, SemanticRole][] = [
  [
    /\b(ipa|apa|stout|porter|lager|pilsen|golden|scotch|honey|cerveza|cervezas|pinta|pintas|chopp|birra|lata de cerveza)\b/,
    'BEER',
  ],
  [
    /\b(fernet|gin tonic|gintonic|negroni|aperol|spritz|mojito|daiquiri|caipi\w*|margarita|old fashioned|cocktail|coctel|trago|tragos|vermu|vermut|vermouth|campari|cynar|whisky|tonic)\b/,
    'COCKTAIL',
  ],
  [
    /\b(malbec|cabernet|merlot|syrah|bonarda|torrontes|chardonnay|sauvignon|blend|espumante|champagne|vino|vinos|copa de vino|rose)\b/,
    'WINE',
  ],
  [
    /\b(gaseosa|coca|sprite|agua|soda|limonada|jugo|exprimido|licuado|tonica)\b/,
    'SOFT_DRINK',
  ],
  [
    /\b(cafe|cortado|lagrima|capuccino|cappuccino|latte|flat white|espresso|americano|te|chai|submarino|chocolate caliente|mate cocido)\b/,
    'COFFEE',
  ],
  [
    /\b(medialuna|medialunas|croissant|factura|facturas|tostado|tostados|scon\w*|budin|alfajor|cookie|cookies|muffin|brownie|torta|tortas|cheesecake|lemon pie|tarta dulce|chipa)\b/,
    'PASTRY',
  ],
  [
    /\b(brunch|huevos|benedict|avocado toast|tostada de palta|pancakes?|waffles?|bowl de yogur|granola)\b/,
    'BRUNCH',
  ],
  [/\b(desayuno|desayunos)\b/, 'BREAKFAST'],
  [
    /\b(flan|helado|postre|tiramisu|panqueque|volcan|mousse|budin de pan|vigilante|creme brulee)\b/,
    'DESSERT',
  ],
  [/\b(papas fritas|papas|guarnicion|pure|ensalada chica|batatas)\b/, 'SIDE'],
  [
    /\b(tabla|tablas|picada|picadas|para compartir|nachos|tapas|provoleta|empanadas?|rabas|bastones|fainá|faina|croquetas|bruschettas?)\b/,
    'SHAREABLE',
  ],
  [
    /\b(entrada|entradas|carpaccio|burrata|tartar|ceviche|sopa|crema de)\b/,
    'STARTER',
  ],
];

const COARSE_FALLBACK: Record<MenuRole, SemanticRole | null> = {
  main: 'MAIN',
  starter: 'STARTER',
  dessert: 'DESSERT',
  drink: null,
};

/** The semantic role of an item, or null when its words do not say. */
export function semanticRole(item: MenuItemFact): SemanticRole | null {
  const words = normalizeSearchText(item.name);
  for (const [pattern, role] of ROLE_WORDS) {
    if (!pattern.test(words)) continue;
    // A sweet in a mains section ("Panqueques de verdura") is not a dessert:
    // only trust word roles that agree with drinks/desserts sections, or
    // that refine a main/starter into a shareable/side.
    if (item.role === 'main' && ['DESSERT', 'PASTRY', 'COFFEE'].includes(role))
      continue;
    if (
      item.role === 'drink' &&
      !['BEER', 'COCKTAIL', 'WINE', 'SOFT_DRINK', 'COFFEE'].includes(role)
    )
      continue;
    return role;
  }
  return COARSE_FALLBACK[item.role];
}

type Style = 'LIGHT' | 'STANDARD' | 'FULL';

interface Component {
  /** Acceptable roles, most fitting first. */
  roles: SemanticRole[];
  /** Coarse roles also accepted when no semantic role matches. */
  coarse?: MenuRole[];
  portions: (people: number) => number;
  label: string;
  /** Optional components never block the basket. */
  optional?: boolean;
}

const each = (people: number) => people;
const shared = (people: number) => Math.ceil(people / 2);
const rounds = (people: number) => people * 2;

/** The order a person would make for this experience and context. */
export function recipeFor(
  experience: ExperienceKey,
  occasion: Occasion | null,
  style: Style,
): { name: string; components: Component[] } {
  const romantic = occasion === 'romantic' || occasion === 'first_date';
  const friends = occasion === 'friends' || occasion === 'celebration';
  const drink = (preferred: SemanticRole[]): Component => ({
    roles: [...preferred, 'WINE', 'BEER', 'COCKTAIL', 'SOFT_DRINK'],
    coarse: ['drink'],
    portions: each,
    label: 'bebida por persona',
  });
  switch (experience) {
    case 'drinks':
    case 'beer': {
      const beer = experience === 'beer' || friends;
      return {
        name: beer
          ? 'Ronda de pintas y algo para picar'
          : 'Tragos y algo para picar',
        components: [
          {
            roles: beer
              ? ['BEER', 'COCKTAIL', 'WINE']
              : ['COCKTAIL', 'WINE', 'BEER'],
            coarse: ['drink'],
            portions: style === 'LIGHT' ? each : rounds,
            label:
              style === 'LIGHT' ? 'un trago por persona' : 'dos por persona',
          },
          {
            roles: ['SHAREABLE', 'STARTER'],
            coarse: ['starter'],
            portions: shared,
            label: 'para compartir',
            optional: style === 'LIGHT',
          },
        ],
      };
    }
    case 'merienda':
    case 'breakfast':
      return {
        name: experience === 'merienda' ? 'Merienda' : 'Desayuno',
        components: [
          {
            roles: ['COFFEE'],
            portions: each,
            label: 'café o infusión por persona',
          },
          {
            roles: ['PASTRY', 'BREAKFAST', 'DESSERT'],
            coarse: ['dessert'],
            portions: each,
            label: 'algo dulce o tostado por persona',
          },
        ],
      };
    case 'brunch':
      return {
        name: 'Brunch',
        components: [
          {
            roles: ['BRUNCH', 'BREAKFAST'],
            portions: each,
            label: 'plato de brunch por persona',
          },
          {
            roles: ['COFFEE', 'SOFT_DRINK'],
            coarse: ['drink'],
            portions: each,
            label: 'café o jugo por persona',
          },
        ],
      };
    case 'dessert':
      return {
        name: 'Algo dulce',
        components: [
          {
            roles: ['DESSERT', 'PASTRY'],
            coarse: ['dessert'],
            portions: each,
            label: 'postre por persona',
          },
        ],
      };
    default: {
      const components: Component[] = [];
      if (style !== 'LIGHT')
        components.push({
          roles: friends ? ['SHAREABLE', 'STARTER'] : ['STARTER', 'SHAREABLE'],
          coarse: ['starter'],
          portions: romantic ? () => 1 : shared,
          label: 'entrada para compartir',
          optional: style === 'STANDARD',
        });
      components.push({
        roles: ['MAIN'],
        coarse: ['main'],
        portions: each,
        label: 'principal por persona',
      });
      components.push(
        drink(
          romantic
            ? ['WINE', 'COCKTAIL']
            : friends
              ? ['BEER', 'WINE']
              : ['WINE', 'SOFT_DRINK'],
        ),
      );
      if (style === 'FULL')
        components.push({
          roles: ['DESSERT'],
          coarse: ['dessert'],
          portions: romantic ? () => 1 : shared,
          label: romantic ? 'postre para compartir' : 'postres',
          optional: true,
        });
      return {
        name: romantic
          ? 'Cena para dos'
          : friends
            ? 'Comida para compartir'
            : 'Comida completa',
        components,
      };
    }
  }
}

export interface BasketLine {
  label: string;
  quantity: number;
  /** Representative real item (median of the typical band). */
  item: string;
  unitPrice: number;
  /** Other real options of the band, for "qué podrían pedir". */
  options: string[];
}

export interface IntentBasket {
  name: string;
  style: Style;
  people: number;
  min: number;
  max: number;
  /** A representative real order and its total, inside [min, max]. */
  suggestion: { lines: BasketLine[]; total: number };
  sourceUrl: string;
  observedAt: string;
  sourceUpdatedAt: string | null;
}

function fresh(menu: MenuObservation, at: Date): boolean {
  const observed = Date.parse(menu.observedAt);
  const updated = menu.sourceUpdatedAt
    ? Date.parse(menu.sourceUpdatedAt)
    : observed;
  const expires = Date.parse(menu.expiresAt);
  return (
    [observed, updated, expires].every(Number.isFinite) &&
    observed <= at.getTime() &&
    expires > at.getTime() &&
    updated <= observed
  );
}

function choices(
  menu: MenuObservation,
  component: Component,
  moment: MealMoment | undefined,
): MenuItemFact[] {
  const usable = menu.items.filter(
    (item) =>
      item.amount > 0 &&
      Number.isFinite(item.amount) &&
      Number.isInteger(item.serves) &&
      item.serves > 0 &&
      (!moment || item.moments.length === 0 || item.moments.includes(moment)),
  );
  for (const role of component.roles) {
    const found = usable.filter((item) => semanticRole(item) === role);
    if (found.length) return found;
  }
  // Coarse fallback only for items whose words say nothing more specific.
  if (component.coarse)
    return usable.filter(
      (item) =>
        component.coarse!.includes(item.role) &&
        (semanticRole(item) === null ||
          semanticRole(item) === COARSE_FALLBACK[item.role]),
    );
  return [];
}

/**
 * The bounded consumption for this intent from the current menu, with a
 * representative real order. Null when the menu is stale or a required
 * component has no priced item (never filled with a guess).
 */
export function intentBasket(
  menu: MenuObservation,
  input: {
    people: number;
    experience: ExperienceKey;
    moment?: MealMoment;
    occasion: Occasion | null;
    style: Style;
  },
  at: Date,
): IntentBasket | null {
  const people = input.people;
  if (!Number.isInteger(people) || people < 1 || people > 1000) return null;
  if (!fresh(menu, at)) return null;
  const recipe = recipeFor(input.experience, input.occasion, input.style);
  let min = 0;
  let max = 0;
  const lines: BasketLine[] = [];
  for (const component of recipe.components) {
    const found = choices(menu, component, input.moment);
    if (!found.length) {
      if (component.optional) continue;
      return null;
    }
    const portions = component.portions(people);
    const priced = found
      .map((item) => ({
        item,
        cost: Math.ceil(portions / item.serves) * item.amount,
      }))
      .sort(
        (a, b) => a.cost - b.cost || a.item.name.localeCompare(b.item.name),
      );
    const band =
      priced.length >= 4
        ? priced.slice(
            Math.floor((priced.length - 1) * 0.25),
            Math.ceil((priced.length - 1) * 0.75) + 1,
          )
        : priced;
    const representative = band[Math.floor((band.length - 1) / 2)];
    min += band[0].cost;
    max += band[band.length - 1].cost;
    lines.push({
      label: component.label,
      quantity: Math.ceil(portions / representative.item.serves),
      item: representative.item.name,
      unitPrice: representative.item.amount,
      options: band
        .filter((entry) => entry !== representative)
        .slice(0, 3)
        .map((entry) => entry.item.name),
    });
  }
  if (!lines.length) return null;
  const total = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  return {
    name: recipe.name,
    style: input.style,
    people,
    min: Math.round(min),
    max: Math.round(max),
    suggestion: { lines, total: Math.round(total) },
    sourceUrl: menu.sourceUrl,
    observedAt: menu.observedAt,
    sourceUpdatedAt: menu.sourceUpdatedAt,
  };
}

/**
 * "¿Qué podemos pedir con $60.000?": the richest real order of this intent
 * (FULL → STANDARD → LIGHT) whose representative total fits the amount.
 * Null when no representative order on the current menu fits.
 */
export function orderWithin(
  menu: MenuObservation,
  input: {
    people: number;
    experience: ExperienceKey;
    moment?: MealMoment;
    occasion: Occasion | null;
  },
  budget: number,
  at: Date,
): IntentBasket | null {
  for (const style of ['FULL', 'STANDARD', 'LIGHT'] as const) {
    const basket = intentBasket(menu, { ...input, style }, at);
    if (basket && basket.suggestion.total <= budget) return basket;
  }
  return null;
}

/**
 * Factual menu features: depth of cocktails/beer/wine/desserts/brunch,
 * food for sharing, vegetarian options. Evidence for context ranking,
 * never "romantic" or "trendy" by themselves.
 */
export function menuFeatures(menu: MenuObservation): TraitEvidence[] {
  const count = (role: SemanticRole) =>
    menu.items.filter((item) => semanticRole(item) === role).length;
  const traits: TraitEvidence[] = [];
  const add = (
    trait: TraitEvidence['trait'],
    n: number,
    threshold: number,
    label: string,
  ) => {
    if (n >= threshold)
      traits.push({
        trait,
        score: Math.min(0.9, 0.5 + n / (threshold * 4)),
        source: 'MENU_DERIVED',
        confidence: 0.8,
        evidence: `${n} ${label} en la carta oficial`,
      });
  };
  add('cocktails', count('COCKTAIL'), 5, 'tragos');
  add('craft_beer', count('BEER'), 5, 'cervezas');
  add('wine_focus', count('WINE'), 8, 'vinos');
  add(
    'dessert_focus',
    count('DESSERT') + count('PASTRY'),
    6,
    'postres y dulces',
  );
  add('brunch', count('BRUNCH'), 3, 'platos de brunch');
  add('sharing_food', count('SHAREABLE'), 4, 'platos para compartir');
  const veggie = menu.items.filter((item) =>
    /\b(vegetarian[oa]|vegan[oa]|veggie|sin carne|tofu|seitan)\b/.test(
      normalizeSearchText(item.name),
    ),
  ).length;
  add('vegetarian_friendly', veggie, 3, 'opciones vegetarianas');
  return traits;
}

/** Items whose own name contains a requested dish word ("sushi", "vermú"). */
export function menuMatches(menu: MenuObservation, words: string[]): number {
  if (!words.length) return 0;
  return menu.items.filter((item) => {
    const name = normalizeSearchText(item.name);
    return words.some((word) => word.length >= 4 && name.includes(word));
  }).length;
}
