/**
 * Venue promotion: how a venue SmartPlan has only a HINT about (an OSM
 * name and point, a name-derived domain) becomes a canonical Place.
 *
 *   hint → candidate official URLs → polite fetch → identity check
 *        → canonical name, kind and street address FROM THE OFFICIAL PAGE
 *        → Georef (CC BY) geocode of that address, which must land within
 *          500 m of the hint point (independent cross-check)
 *        → Place (published, SmartPlan-owned coordinates) + VERIFIED source
 *
 * Nothing from the hint is persisted as a fact: OSM supplies where to look
 * and a point to cross-check against, never the name, address or position.
 */
import { normalizeText } from './extract/hours-text';
import type { BusinessFacts } from './extract/business-facts';
import type { PageContent } from './extract/page';
import { nameTokens } from './identity';

export interface VenueHint {
  name: string;
  latitude: number;
  longitude: number;
  /** The hint's own classification (a prior, confirmed by the page). */
  kind: string;
  website: string | null;
}

/** Locality words on Mendoza addresses → catalog department. */
const LOCALITIES: [RegExp, string][] = [
  [
    /\b(chacras de coria|vistalba|lujan de cuyo|perdriel|agrelo|potrerillos|carrodilla|mayor drummond|las compuertas|ugarteche|cacheuta)\b/,
    'Luján de Cuyo',
  ],
  [/\b(godoy cruz)\b/, 'Godoy Cruz'],
  [
    /\b(dorrego|guaymallen|villa nueva|san jose|bermejo|rodeo de la cruz|belgrano guaymallen)\b/,
    'Guaymallén',
  ],
  [
    /\b(maipu|coquimbito|russell|lunlunta|cruz de piedra|luzuriaga|barrancas|fray luis beltran)\b/,
    'Maipú',
  ],
  [/\b(las heras|el challao|el plumerillo|uspallata)\b/, 'Las Heras'],
  [/\b(tupungato|gualtallary|san jose de tupungato|el peral)\b/, 'Tupungato'],
  [
    /\b(tunuyan|vista flores|los arboles|campo de los andes|los sauces)\b/,
    'Tunuyán',
  ],
  [
    /\b(san carlos|la consulta|eugenio bustos|chilecito|pareditas)\b/,
    'San Carlos',
  ],
  [
    /\b(san rafael|las paredes|cuadro benegas|el nihuil|valle grande|rama caida)\b/,
    'San Rafael',
  ],
  [/\b(ciudad de mendoza|capital|mendoza capital|5500)\b/, 'Ciudad de Mendoza'],
];

export function departmentFromText(text: string): string | null {
  const normal = normalizeText(text);
  for (const [pattern, department] of LOCALITIES)
    if (pattern.test(normal)) return department;
  return null;
}

export interface OfficialAddress {
  street: string;
  number: string;
  department: string | null;
  line: string;
}

const ADDRESS_LINE =
  /(?:^|[:\-–|·]\s*)((?:av\.?|avenida|calle|bv\.?|boulevard|ruta|carril|pje\.?|pasaje)?\s*[a-záéíóúñü][a-záéíóúñü.' ]{2,40}?)\s+(?:n[°º]?\s*)?(\d{2,5})\b/i;

/**
 * Street addresses the page itself publishes: Schema.org address first,
 * then lines labelled as an address or carrying a Mendoza locality.
 */
export function officialAddresses(
  page: PageContent,
  facts: BusinessFacts,
): OfficialAddress[] {
  const candidates = [
    ...facts.addresses,
    ...page.lines.filter((line) => {
      const normal = normalizeText(line);
      return (
        line.length <= 160 &&
        (/\b(direccion|ubicacion|estamos en|encontranos|nos encontras|visitanos)\b/.test(
          normal,
        ) ||
          departmentFromText(line) !== null) &&
        /\d{2,5}/.test(line)
      );
    }),
  ];
  const found: OfficialAddress[] = [];
  for (const line of candidates) {
    const cleaned = line.replace(
      /^(direcci[oó]n|ubicaci[oó]n|estamos en|encontranos en|nos encontr[aá]s en|visitanos en)\s*:?\s*/i,
      '',
    );
    const match = ADDRESS_LINE.exec(cleaned);
    if (!match) continue;
    const street = match[1]
      .replace(/^(av\.?|avenida|calle|bv\.?|boulevard)\s+/i, '')
      .trim();
    if (
      /\b(tel|whatsapp|cel|horario|abierto|lunes|martes|cp|codigo)\b/i.test(
        normalizeText(street),
      )
    )
      continue;
    found.push({
      street,
      number: match[2],
      department: departmentFromText(line),
      line: line.slice(0, 160),
    });
  }
  return found;
}

const KIND_WORDS: [RegExp, string][] = [
  [/\b(bodega|winery|vinedos?|vinos de|enoturismo)\b/, 'winery'],
  [/\b(cerveceria|brew ?pub|cerveza artesanal|craft beer)\b/, 'brewery'],
  [/\b(heladeria|helados artesanales|gelato)\b/, 'ice_cream'],
  [
    /\b(cafeteria|coffee|cafe de especialidad|pasteleria|panaderia|brunch|desayunos)\b/,
    'cafe',
  ],
  [
    /\b(restaurante?|resto|parrilla|bistro|trattoria|cocina|pizzeria|sushi|bodegon|ristorante|asador)\b/,
    'restaurant',
  ],
  [
    /\b(bar|cocteleria|cocktails?|tragos|speakeasy|wine bar|vermuteria)\b/,
    'bar',
  ],
];

const SCHEMA_KINDS: Record<string, string> = {
  Restaurant: 'restaurant',
  FastFoodRestaurant: 'restaurant',
  CafeOrCoffeeShop: 'cafe',
  Bakery: 'cafe',
  BarOrPub: 'bar',
  Brewery: 'brewery',
  Winery: 'winery',
  IceCreamShop: 'ice_cream',
};

/** The venue kind from its own page; the hint's kind only breaks a tie. */
export function kindFromPage(
  page: PageContent,
  hintKind: string,
): string | null {
  for (const node of page.jsonLd) {
    const types = Array.isArray(node['@type'])
      ? node['@type']
      : [node['@type']];
    for (const type of types) {
      const kind = SCHEMA_KINDS[String(type)];
      if (kind) return kind;
    }
  }
  const head = normalizeText(
    [
      page.title,
      page.siteName ?? '',
      page.description ?? '',
      ...page.lines.slice(0, 40),
    ].join(' '),
  );
  const matches = KIND_WORDS.filter(([pattern]) => pattern.test(head)).map(
    ([, kind]) => kind,
  );
  const hint = HINT_KINDS[hintKind];
  if (hint && matches.includes(hint)) return hint;
  return matches[0] ?? null;
}

const HINT_KINDS: Record<string, string> = {
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  cafe: 'cafe',
  bar: 'bar',
  pub: 'bar',
  biergarten: 'brewery',
  ice_cream: 'ice_cream',
  winery: 'winery',
  wine_cellar: 'winery',
};

/** The venue's name as its own page writes it (never the hint's spelling). */
export function officialName(
  page: PageContent,
  facts: BusinessFacts,
  hint: VenueHint,
  loose = false,
): string | null {
  const tokens = nameTokens(hint.name);
  // Strict: every distinctive word of the hint. Loose (only with a tighter
  // position cross-check): one long distinctive word ("Soppelsa").
  const fits = (candidate: string) => {
    const normal = normalizeText(candidate);
    const present = tokens.filter((token) =>
      new RegExp(`\\b${token}\\b`).test(normal),
    );
    return loose
      ? present.some((token) => token.length >= 6)
      : tokens.length > 0 && present.length === tokens.length;
  };
  const options = [
    ...facts.names,
    page.siteName ?? '',
    ...page.title.split(/\s[|\-–·:]\s/),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && value.length <= 60);
  const match = options.find(fits);
  if (!match) return null;
  // "Bistró X | Cocina de autor en Mendoza" → "Bistró X".
  return match.replace(/\s*[|\-–·:].*$/, '').trim() || match;
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

export function slugify(name: string, department: string): string {
  return `${normalizeText(name)}-${normalizeText(department)}`
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}
