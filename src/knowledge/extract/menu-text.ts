/**
 * A venue's published menu (HTML page or textual PDF) as priced facts.
 *
 * Reads "Ojo de bife con papas ........ $18.500" style lines under section
 * headings ("Entradas", "Principales", "Bebidas", "Postres"), maps sections
 * to basket roles with a Spanish lexicon, and refuses to price a menu whose
 * structure it cannot read with confidence (it goes to review instead).
 * It never invents an item, a price or a portion.
 */
import type { MealMoment } from '../../catalog/place-actionability';
import type { MenuItemFact, MenuRole } from '../../planning-engine/menu/menu';
import { normalizeText } from './hours-text';

export interface MenuExtraction {
  items: MenuItemFact[];
  /** Priced lines found (including ones that could not be classified). */
  pricedLines: number;
  /** Share of priced lines assigned to a role. */
  classified: number;
  /** Why it cannot be used for a basket, when it cannot. */
  rejection: string | null;
}

const SECTION_ROLES: [RegExp, MenuRole | 'skip'][] = [
  [
    /\b(entradas?|para compartir|picadas?|tablas?|tapas|antipastos?|starters?|empanadas)\b/,
    'starter',
  ],
  [
    /\b(postres?|dulces?|helados?|pasteleria|tortas?|medialunas?|croissants?|budines|alfajores?)\b/,
    'dessert',
  ],
  [/\b(desayunos?|brunch|tostados?|sandwiches)\b/, 'main'],
  [
    /\b(bebidas?|vinos?|cervezas?|tragos?|cocteleria|cocktails?|gaseosas?|aguas?|jugos?|sin alcohol|aperitivos?|espumantes?|whisky|cafeteria|cafes?|infusiones)\b/,
    'drink',
  ],
  [
    /\b(principales?|platos?( principales)?|carnes?|parrilla|pastas?|pizzas?|hamburguesas?|burgers?|sandwich(es)?|sandguches|lomos?|lomitos?|minutas|pescados?|mariscos?|risottos?|ensaladas?|wok|sushi|rolls?|tacos?|menu del dia|ejecutivo|milanesas?|especialidades|de la casa|cocina|guisos?|al plato)\b/,
    'main',
  ],
  [
    /\b(guarniciones?|adicionales?|extras?|agregados?|salsas?|toppings?)\b/,
    'skip',
  ],
];

const MOMENT_SECTIONS: [RegExp, MealMoment][] = [
  [/\bdesayunos?\b/, 'breakfast'],
  [/\bbrunch\b/, 'brunch'],
  [/\b(almuerzos?|mediodia|ejecutivo|menu del dia)\b/, 'lunch'],
  [/\bmeriendas?\b/, 'merienda'],
  [/\bcenas?\b|\bnoche\b/, 'dinner'],
];

/** "$18.500", "18500", "$ 18,500", "ARS 18.500" at the end of a line. */
const PRICE_AT_END =
  /(?:\$|ars)\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,6})(?:[.,]\d{2})?\s*$|(?:^|\s)(\d{1,3}\.\d{3})\s*$/i;

function priceOf(line: string): { name: string; amount: number } | null {
  const normal = line.replace(/\s+/g, ' ').trim();
  const match = PRICE_AT_END.exec(normal);
  if (!match) return null;
  const raw = (match[1] ?? match[2]).replace(/[.,]/g, '');
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 300 || amount > 2_000_000)
    return null;
  const name = normal
    .slice(0, match.index)
    .replace(/[.\-_…·:|]{2,}\s*$/, '')
    .replace(/[\s.:\-–|]+$/, '')
    .trim();
  if (name.length < 3 || name.length > 120) return null;
  return { name, amount };
}

function sectionRole(heading: string): MenuRole | 'skip' | null {
  const normal = normalizeText(heading);
  for (const [pattern, role] of SECTION_ROLES)
    if (pattern.test(normal)) return role;
  return null;
}

/** How many people a priced item serves, only when it says so. */
function servesOf(name: string): number {
  const normal = normalizeText(name);
  const explicit = /\bpara\s+(\d)\b/.exec(normal);
  if (explicit) return Math.max(1, Math.min(6, Number(explicit[1])));
  return 1;
}

const isHeading = (line: string) =>
  line.length <= 60 && !/\d{3}/.test(line) && /[a-záéíóúñ]/i.test(line);

/**
 * Extracts priced items. `defaultMoments` are the venue's own meals (a
 * restaurant: lunch + dinner; a café: breakfast + brunch + merienda),
 * narrowed by moment headings when the menu has them.
 */
export function extractMenu(
  lines: string[],
  defaultMoments: MealMoment[],
): MenuExtraction {
  let role: MenuRole | 'skip' | null = null;
  let moments: MealMoment[] = defaultMoments;
  const items: MenuItemFact[] = [];
  let pricedLines = 0;
  let classifiedLines = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const priced = priceOf(line);
    if (!priced) {
      if (isHeading(line)) {
        const normal = normalizeText(line);
        const moment = MOMENT_SECTIONS.find(([pattern]) =>
          pattern.test(normal),
        );
        if (moment) moments = [moment[1]];
        const next = sectionRole(line);
        if (next) role = next;
      }
      continue;
    }
    pricedLines += 1;
    // An item's own words may name its role ("Copa de vino", "Flan").
    const own = sectionRole(priced.name);
    const itemRole = role ?? (own === 'skip' ? null : own);
    if (!itemRole || itemRole === 'skip') continue;
    if (
      /\b(adicional|extra|agregado|porcion de|guarnicion)\b/.test(
        normalizeText(priced.name),
      )
    )
      continue;
    classifiedLines += 1;
    items.push({
      name: priced.name.slice(0, 120),
      role: itemRole,
      amount: priced.amount,
      serves: servesOf(priced.name),
      moments: [...moments],
    });
  }
  // Price sanity inside each role: drop extreme outliers (a misread phone,
  // a whole-event package) rather than let them widen the estimate.
  const byRole = new Map<MenuRole, MenuItemFact[]>();
  for (const item of items)
    byRole.set(item.role, [...(byRole.get(item.role) ?? []), item]);
  const kept: MenuItemFact[] = [];
  for (const [, roleItems] of byRole) {
    const sorted = roleItems
      .map((i) => i.amount / i.serves)
      .sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    kept.push(
      ...roleItems.filter((i) => {
        const unit = i.amount / i.serves;
        return (
          roleItems.length < 4 || (unit <= median * 4 && unit >= median / 4)
        );
      }),
    );
  }
  const roles = new Set(kept.map((item) => item.role));
  const classified = pricedLines ? classifiedLines / pricedLines : 0;
  let rejection: string | null = null;
  if (kept.length < 6) rejection = 'too_few_items';
  else if (!roles.has('main') && !roles.has('drink') && !roles.has('dessert'))
    rejection = 'no_consumption_items';
  else if (classified < 0.5) rejection = 'unclear_structure';
  return { items: kept, pricedLines, classified, rejection };
}
