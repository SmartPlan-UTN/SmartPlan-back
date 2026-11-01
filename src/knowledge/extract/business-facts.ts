/**
 * Venue facts from one official page, in order of trust:
 * 1. Schema.org JSON-LD / microdata (the publisher's own structured claim);
 * 2. opening hours in text the page labels as its hours;
 * 3. links to its own menu (HTML/PDF) and booking pages, to fetch next.
 *
 * Each fact keeps how it was read, so the planner can say "Horario del sitio
 * oficial" and the refresh job knows where to look again.
 */
import type { MealMoment } from '../../catalog/place-actionability';
import {
  isHoursLabel,
  normalizeText,
  parseSpanishHours,
  type ParsedWeek,
} from './hours-text';
import type { PageContent, PageLink } from './page';

export type HoursMethod = 'SCHEMA_ORG' | 'MICRODATA' | 'OFFICIAL_TEXT';

export interface ExtractedHours {
  week: ParsedWeek;
  method: HoursMethod;
  evidence: string;
}

export interface BusinessFacts {
  names: string[];
  telephones: string[];
  addresses: string[];
  geo: { latitude: number; longitude: number } | null;
  hours: ExtractedHours | null;
  /** "$$", "$$$", "ARS 20000-40000"… as published. */
  priceRange: string | null;
  cuisines: string[];
  servesMoments: MealMoment[];
  acceptsReservations: boolean | null;
  menuLinks: PageLink[];
  bookingLinks: PageLink[];
  /** Links to the venue's other official presences (for identity). */
  sameAs: string[];
}

const BUSINESS_TYPES = new Set([
  'Restaurant',
  'FoodEstablishment',
  'CafeOrCoffeeShop',
  'BarOrPub',
  'Brewery',
  'Winery',
  'Distillery',
  'IceCreamShop',
  'Bakery',
  'FastFoodRestaurant',
  'LocalBusiness',
  'MovieTheater',
  'TouristAttraction',
  'Museum',
  'NightClub',
  'Hotel',
  'LodgingBusiness',
]);

const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const types = (node: Record<string, unknown>) =>
  list(node['@type']).map((t) =>
    String(t)
      .replace('https://schema.org/', '')
      .replace('http://schema.org/', ''),
  );

const SCHEMA_DAYS: Record<string, number> = {
  su: 0,
  sunday: 0,
  mo: 1,
  monday: 1,
  tu: 2,
  tuesday: 2,
  we: 3,
  wednesday: 3,
  th: 4,
  thursday: 4,
  fr: 5,
  friday: 5,
  sa: 6,
  saturday: 6,
};

const toMinutes = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= 1440 ? minutes : null;
};

function schemaDay(value: unknown): number | null {
  const raw = String(value)
    .replace(/^https?:\/\/schema\.org\//, '')
    .toLowerCase();
  return SCHEMA_DAYS[raw] ?? null;
}

/** openingHoursSpecification → week; null when nothing usable. */
export function weekFromSpecification(
  specs: unknown,
  at: Date,
): ParsedWeek | null {
  const week: ParsedWeek = [null, null, null, null, null, null, null];
  let any = false;
  for (const raw of list(specs)) {
    if (!raw || typeof raw !== 'object') continue;
    const spec = raw as Record<string, unknown>;
    const validThrough = str(spec.validThrough);
    const validFrom = str(spec.validFrom);
    // A seasonal or holiday exception is not the regular week.
    if (validThrough && Date.parse(validThrough) < at.getTime()) continue;
    if (validFrom && validThrough) continue;
    const opens = str(spec.opens);
    const closes = str(spec.closes);
    for (const dayValue of list(spec.dayOfWeek)) {
      const day = schemaDay(dayValue);
      if (day === null) continue;
      if (!opens || !closes) continue;
      const open = toMinutes(opens);
      let close = toMinutes(closes);
      if (open === null || close === null) continue;
      if (open === close) {
        // 00:00–00:00 is how some publishers write "closed".
        week[day] = 'closed';
        any = true;
        continue;
      }
      if (close <= open) close += 1440;
      const existing = week[day];
      week[day] = [...(Array.isArray(existing) ? existing : []), [open, close]];
      any = true;
    }
  }
  if (!any) return null;
  // Schema.org: days not listed are closed.
  for (let d = 0; d < 7; d += 1) week[d] ??= 'closed';
  return week;
}

/** "Mo-Fr 12:00-16:00", "Tu,We 20:00-00:30" → week. */
export function weekFromOpeningHoursText(values: string[]): ParsedWeek | null {
  const week: ParsedWeek = [null, null, null, null, null, null, null];
  let any = false;
  const order = [1, 2, 3, 4, 5, 6, 0];
  for (const value of values.flatMap((v) => v.split(/[;\n]/))) {
    const match =
      /^\s*([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2})*)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(
        value,
      );
    if (!match) continue;
    const days = new Set<number>();
    for (const part of match[1].split(',')) {
      const [from, to] = part
        .split('-')
        .map((d) => SCHEMA_DAYS[d.trim().toLowerCase()]);
      if (from === undefined) continue;
      if (to === undefined) days.add(from);
      else {
        let i = order.indexOf(from);
        for (let guard = 0; guard < 7; guard += 1) {
          days.add(order[i]);
          if (order[i] === to) break;
          i = (i + 1) % 7;
        }
      }
    }
    const open = toMinutes(match[2]);
    let close = toMinutes(match[3]);
    if (open === null || close === null) continue;
    if (close <= open) close += 1440;
    for (const day of days) {
      const existing = week[day];
      week[day] = [...(Array.isArray(existing) ? existing : []), [open, close]];
      any = true;
    }
  }
  if (!any) return null;
  for (let d = 0; d < 7; d += 1) week[d] ??= 'closed';
  return week;
}

/**
 * Text the page labels as its hours: a label line and the few lines after
 * it (or the same line). Menu services ("menú ejecutivo") are excluded.
 */
export function hoursFromText(lines: string[]): ExtractedHours | null {
  let best: ExtractedHours | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (!isHoursLabel(lines[index]) || lines[index].length > 400) continue;
    const window = lines.slice(index, index + 6).join('\n');
    const parsed = parseSpanishHours(window);
    if (!parsed) continue;
    if (!best || parsed.statedDays > best.week.filter((d) => d !== null).length)
      best = {
        week: parsed.week,
        method: 'OFFICIAL_TEXT',
        evidence: parsed.segments.join(' | ').slice(0, 300),
      };
  }
  return best;
}

const MENU_LINK =
  /\b(menu|menú|carta|cartas|nuestra carta|ver carta|food|platos)\b/i;
const BOOKING_HOSTS =
  /(wosbooking\.com|meitre\.com|reservas\.|bookingtable|turnosweb|reservar)/i;

function menuLinks(links: PageLink[]): PageLink[] {
  return links.filter(({ href, text }) => {
    if (/instagram|facebook|whatsapp|pedidosya|rappi|wa\.me/i.test(href))
      return false;
    const named =
      MENU_LINK.test(text) ||
      /\/(menu|carta)s?\b|(menu|carta)[^/]*\.pdf/i.test(href);
    // A PDF is a menu only when it says so (not a wine tech sheet or a policy).
    if (/\.pdf($|\?)/i.test(href))
      return (
        named && !/ficha|tecnica|politica|policy|cv|press/i.test(href + text)
      );
    return named;
  });
}

const MOMENT_WORDS: [RegExp, MealMoment][] = [
  [/\bdesayunos?\b/, 'breakfast'],
  [/\bbrunch\b/, 'brunch'],
  [/\balmuerzos?\b|\bmediodia\b/, 'lunch'],
  [/\bmeriendas?\b/, 'merienda'],
  [/\bcenas?\b/, 'dinner'],
];

export function extractBusinessFacts(
  page: PageContent,
  at: Date,
): BusinessFacts {
  const business = page.jsonLd.filter((node) =>
    types(node).some((type) => BUSINESS_TYPES.has(type)),
  );
  const names = new Set<string>();
  const telephones = new Set(page.telephones);
  const addresses = new Set<string>();
  const cuisines = new Set<string>();
  const sameAs = new Set<string>();
  let geo: BusinessFacts['geo'] = null;
  let hours: ExtractedHours | null = null;
  let priceRange: string | null = null;
  let acceptsReservations: boolean | null = null;
  const menuFromSchema: PageLink[] = [];

  for (const node of business) {
    const name = str(node.name);
    if (name) names.add(name);
    for (const phone of list(node.telephone)) {
      const value = str(phone);
      if (value) telephones.add(value);
    }
    for (const address of list(node.address)) {
      if (typeof address === 'string') addresses.add(address);
      else if (address && typeof address === 'object') {
        const a = address as Record<string, unknown>;
        const line = [str(a.streetAddress), str(a.addressLocality)]
          .filter(Boolean)
          .join(', ');
        if (line) addresses.add(line);
      }
    }
    const g = node.geo as Record<string, unknown> | undefined;
    const latitude = Number(g?.latitude);
    const longitude = Number(g?.longitude);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude &&
      longitude
    )
      geo ??= { latitude, longitude };
    const week =
      weekFromSpecification(node.openingHoursSpecification, at) ??
      weekFromOpeningHoursText(list(node.openingHours).map(String));
    if (week && !hours)
      hours = {
        week,
        method: 'SCHEMA_ORG',
        evidence: JSON.stringify(
          node.openingHoursSpecification ?? node.openingHours,
        ).slice(0, 300),
      };
    priceRange ??= str(node.priceRange);
    for (const cuisine of list(node.servesCuisine)) {
      const value = str(cuisine);
      if (value) cuisines.add(value);
    }
    if (typeof node.acceptsReservations === 'boolean')
      acceptsReservations = node.acceptsReservations;
    else if (str(node.acceptsReservations))
      acceptsReservations = !/false|no/i.test(String(node.acceptsReservations));
    for (const menu of list(node.hasMenu ?? node.menu)) {
      const href =
        str(menu) ?? str((menu as Record<string, unknown> | null)?.url);
      if (href) menuFromSchema.push({ href, text: 'menu (schema.org)' });
    }
    for (const link of list(node.sameAs)) {
      const value = str(link);
      if (value) sameAs.add(value);
    }
  }

  if (!hours && page.microdataHours.length) {
    const week = weekFromOpeningHoursText(page.microdataHours);
    if (week)
      hours = {
        week,
        method: 'MICRODATA',
        evidence: page.microdataHours.join(' | ').slice(0, 300),
      };
  }
  hours ??= hoursFromText(page.lines);

  const text = normalizeText(page.lines.join('\n'));
  const servesMoments = MOMENT_WORDS.filter(([pattern]) =>
    pattern.test(text),
  ).map(([, moment]) => moment);

  return {
    names: [...names],
    telephones: [...telephones],
    addresses: [...addresses],
    geo,
    hours,
    priceRange,
    cuisines: [...cuisines],
    servesMoments,
    acceptsReservations,
    menuLinks: [...menuFromSchema, ...menuLinks(page.links)].slice(0, 6),
    bookingLinks: page.links
      .filter(({ href }) => BOOKING_HOSTS.test(href))
      .slice(0, 4),
    sameAs: [...sameAs],
  };
}
