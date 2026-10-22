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

export const MENU_BLOCK_BOUNDARY = '__SMARTPLAN_MENU_BLOCK_BOUNDARY__';

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
    /\b(bebidas?|vinos?|cervezas?|cervecero|pintas?|jarras?|latas?|tragos?|cocteleria|cocktails?|gaseosas?|aguas?|jugos?|sin alcohol|aperitivos?|espumantes?|whisky|cafeteria|cafes?|infusiones)\b/,
    'drink',
  ],
  [
    /\b(principal(?:es)?|platos?( principales)?|carnes?|parrilla|pastas?|pizzas?|hamburguesas?|burgers?|sandwich(es)?|sandguches|lomos?|lomitos?|minutas|pescados?|mariscos?|risottos?|ensaladas?|wok|sushi|rolls?|tacos?|menus?|menu del dia|ejecutivo|milanesas?|especialidades|de la casa|cocina|guisos?|al plato)\b/,
    'main',
  ],
  [
    /\b(guarniciones?|complementos?|adicionales?|extras?|agregados?|salsas?|toppings?)\b/,
    'skip',
  ],
];

const MOMENT_SECTIONS: [RegExp, MealMoment][] = [
  [/\bdesayunos?\b/, 'breakfast'],
  [/\bbrunch\b/, 'brunch'],
  [/\b(almuerzos?|mediodia|(?:menu )?ejecutivo|menu del dia)\b/, 'lunch'],
  [/\b(meriendas?|media tarde)\b/, 'merienda'],
  [/\bcenas?\b|\bnoche\b/, 'dinner'],
];

/** Currency-marked or grouped prices, including PDF columns like "Plato23 000". */
const PRICE_AT_END =
  /(?:\$|ars)\s*(\d{1,3}(?:[., ]\d{3})+|\d{3,6})(?:[.,]\d{2})?\s*$|(?<!\d)(\d{1,3}(?:[. ]\d{3})+)\s*$/i;

function priceOf(line: string): { name: string; amount: number } | null {
  const normal = line.replace(/\s+/g, ' ').trim();
  const match = PRICE_AT_END.exec(normal);
  if (!match) return null;
  const raw = (match[1] ?? match[2]).replace(/[., ]/g, '');
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 300 || amount > 2_000_000)
    return null;
  const name = normal
    .slice(0, match.index)
    .replace(/[.\-_…·:|]{2,}\s*$/, '')
    .replace(/[\s.:\-–|]+$/, '')
    .trim();
  if (name.length < 3 || name.length > 120) return null;
  // A second price belongs to an unresolved size/variant grid, not the name.
  if (/(?:\$|ars)\s*\d|\d{1,3}[., ]\d{3}/i.test(name)) return null;
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
  const explicit = /\bpara\s+(\d)\b|\b(\d)\s+personas?\b/.exec(normal);
  if (explicit)
    return Math.max(1, Math.min(6, Number(explicit[1] ?? explicit[2])));
  return 1;
}

const HEADING_LABELS = [...SECTION_ROLES, ...MOMENT_SECTIONS].map(
  ([pattern]) => new RegExp(`^(?:${pattern.source})$`, pattern.flags),
);

function isHeading(line: string): boolean {
  if (line.length > 60 || /\d{3}/.test(line) || !/[a-záéíóúñ]/i.test(line))
    return false;
  // A continuation such as "salsa griega, postre del día" is not a section.
  return (
    line === line.toLocaleUpperCase('es') ||
    HEADING_LABELS.some((pattern) => pattern.test(normalizeText(line)))
  );
}

function momentsOf(text: string): MealMoment[] {
  const normal = normalizeText(text);
  return MOMENT_SECTIONS.filter(([pattern]) => pattern.test(normal)).map(
    ([, moment]) => moment,
  );
}

/**
 * Extracts priced items. `defaultMoments` are the venue's own meals (a
 * restaurant: lunch + dinner; a café: breakfast + brunch + merienda),
 * narrowed by moment headings when the menu has them.
 */
export function extractMenu(
  lines: string[],
  defaultMoments: MealMoment[],
): MenuExtraction {
  const wineList = lines
    .slice(0, 3)
    .some((line) =>
      /^(carta de vinos|wine list|carta de vinhos)$/.test(normalizeText(line)),
    );
  let wineByGlass = false;
  let wineSection = wineList;
  let role: MenuRole | 'skip' | null = null;
  let moments: MealMoment[] = defaultMoments;
  const items: MenuItemFact[] = [];
  let pricedLines = 0;
  let classifiedLines = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === MENU_BLOCK_BOUNDARY) {
      moments = defaultMoments;
      continue;
    }
    if (!line) continue;
    const priced = priceOf(line);
    if (!priced) {
      const normal = normalizeText(line);
      if (isHeading(line)) {
        if (/\b(vinos|wine list|espumantes|bodegas)\b/.test(normal)) {
          wineSection = true;
          wineByGlass = /\b(copa|glass)\b/.test(normal);
        } else if (/^(a la copa|por copa|by the glass)$/.test(normal)) {
          wineByGlass = true;
        } else if (sectionRole(line) && !wineList) {
          wineSection = false;
          wineByGlass = false;
        }
      }
      if (wineList) {
        if (/^(a la copa|por copa|by the glass)$/.test(normal))
          wineByGlass = true;
        else if (isHeading(line)) wineByGlass = false;
      }
      if (
        /^(desayunos?|almuerzos?|meriendas?|brunch|cenas?)\b/.test(normal) &&
        /\b(?:de|desde) \d{1,2}[.:]\d{2}\b/.test(normal)
      ) {
        const serviceMoments = momentsOf(line);
        if (serviceMoments.length) moments = serviceMoments;
      }
      if (isHeading(line)) {
        const explicitMoments = momentsOf(line);
        if (explicitMoments.length) moments = explicitMoments;
        const next = sectionRole(line);
        if (normalizeText(line) === 'menu') role = null;
        else if (next) role = next;
      }
      continue;
    }
    pricedLines += 1;
    // A labelled pairing/package is not an individual starter or drink.
    if (
      /^(maridaje\b|menu\s+(?:degustacion|de\s+\d+\s+pasos))/.test(
        normalizeText(priced.name),
      )
    ) {
      classifiedLines += 1;
      continue;
    }
    // An explicit wine document does not establish bottle servings. Only a
    // publisher-labelled by-the-glass section can supply individual drinks.
    if (
      wineSection &&
      !wineByGlass &&
      !/\bcopa\b/.test(normalizeText(priced.name))
    ) {
      classifiedLines += 1;
      continue;
    }
    // An item's own words may name its role ("Copa de vino", "Flan").
    const own = sectionRole(priced.name);
    const itemRole = wineList
      ? 'drink'
      : (role ?? (own === 'skip' ? null : own));
    if (!itemRole || itemRole === 'skip') continue;
    if (
      /\b(adicional|extra(?!\s+(?:brut|seco)\b)|agregado|porcion de|guarnicion|menu nino|menu infantil|dias habiles)\b/.test(
        normalizeText(priced.name),
      )
    )
      continue;
    classifiedLines += 1;
    const itemMoments = momentsOf(priced.name);
    items.push({
      name: (wineList ? `Copa de vino · ${priced.name}` : priced.name).slice(
        0,
        120,
      ),
      role: itemRole,
      amount: priced.amount,
      serves: servesOf(priced.name),
      moments: itemMoments.length ? itemMoments : [...moments],
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
  // Repeated desktop/mobile markup is not another menu item. Conflicting
  // prices without explicit variant names cannot support an order estimate.
  const pricesByName = new Map<string, Set<number>>();
  for (const item of kept) {
    const key = `${item.role}|${normalizeText(item.name)}`;
    pricesByName.set(
      key,
      (pricesByName.get(key) ?? new Set()).add(item.amount),
    );
  }
  const unique = new Map<string, MenuItemFact>();
  for (const item of kept) {
    const key = `${item.role}|${normalizeText(item.name)}`;
    if (pricesByName.get(key)!.size === 1) unique.set(key, item);
  }
  const normalized = [...unique.values()];
  const roles = new Set(normalized.map((item) => item.role));
  const classified = pricedLines ? classifiedLines / pricedLines : 0;
  let rejection: string | null = null;
  if (normalized.length < 6) rejection = 'too_few_items';
  else if (!roles.has('main') && !roles.has('drink') && !roles.has('dessert'))
    rejection = 'no_consumption_items';
  else if (classified < 0.5) rejection = 'unclear_structure';
  return { items: normalized, pricedLines, classified, rejection };
}
