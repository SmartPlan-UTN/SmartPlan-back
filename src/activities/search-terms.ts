/**
 * Plain activity search: accent/case-insensitive, token based, with a small
 * table of obvious Spanish synonyms. It is deliberately NOT a semantic search:
 * natural-language intent is the assistant's job. What it must not do is fail
 * for naming reasons ("rafting" vs "balsa", "gastronomia" vs "Gastronomy",
 * "valle de uco" vs "Tupungato").
 *
 * Pure functions: no database.
 */

/** Lowercase, no accents, only [a-z0-9] and single spaces. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'lo',
  'un',
  'una',
  'unos',
  'unas',
  'en',
  'con',
  'para',
  'por',
  'y',
  'e',
  'o',
  'a',
  'al',
  'que',
  'me',
  'mi',
  'su',
  'sus',
  'hay',
  'algo',
  'quiero',
  'busco',
  'cerca',
  'dia',
]);

/**
 * Normalised search word or phrase -> related terms. Terms are matched with
 * LIKE against the activity text, its type, its categories and its place
 * (name, address, kind, department). Keep entries obvious: a synonym that
 * would return unrelated activities is worse than no synonym.
 */
const SYNONYMS: Record<string, string[]> = {
  rafting: ['rafting', 'rapidos', 'balsa'],
  trekking: ['trekking', 'senderismo', 'caminata', 'sendero'],
  senderismo: ['trekking', 'senderismo', 'caminata', 'sendero'],
  caminata: ['caminata', 'trekking', 'senderismo', 'sendero'],
  cabalgata: ['cabalgata', 'caballo', 'equitacion'],
  cabalgatas: ['cabalgata', 'caballo', 'equitacion'],
  aventura: [
    'aventura',
    'rafting',
    'trekking',
    'cabalgata',
    'excursion',
    'outdoors',
    'sports',
  ],
  sushi: ['sushi', 'japones', 'japonesa', 'nikkei', 'nigiri'],
  cerveza: ['cerveza', 'cervezas', 'cerveceria', 'cervecera', 'pinta', 'brew'],
  cervezas: ['cerveza', 'cervezas', 'cerveceria', 'cervecera', 'pinta'],
  'cerveza artesanal': [
    'cerveza artesanal',
    'cervezas artesanales',
    'cerveceria',
    'cervecera',
    'craft',
    'brew',
    'brewery',
  ],
  gratis: ['gratis', 'gratuito', 'gratuita', 'entrada libre'],
  gratuito: ['gratis', 'gratuito', 'gratuita', 'entrada libre'],
  gratuita: ['gratis', 'gratuito', 'gratuita', 'entrada libre'],
  guiada: ['guiada', 'guiado', 'recorrido', 'visita', 'tour'],
  guiado: ['guiada', 'guiado', 'recorrido', 'visita', 'tour'],
  recorrido: ['recorrido', 'visita', 'guiada', 'tour', 'paseo'],
  visita: ['visita', 'visitar', 'recorrido', 'guiada', 'tour'],
  museo: ['museo', 'museum'],
  museos: ['museo', 'museum'],
  arte: ['arte', 'art', 'galeria', 'muestra'],
  historia: ['historia', 'historico', 'historica', 'patrimonio', 'heritage'],
  vino: ['vino', 'vinos', 'bodega', 'winery', 'degustacion', 'malbec'],
  vinos: ['vino', 'vinos', 'bodega', 'winery', 'degustacion', 'malbec'],
  malbec: ['malbec', 'bodega', 'vino', 'winery', 'degustacion'],
  bodega: ['bodega', 'bodegas', 'winery', 'vino'],
  bodegas: ['bodega', 'bodegas', 'winery', 'vino'],
  restaurante: ['restaurante', 'restaurant', 'resto', 'menu', 'parrilla'],
  restaurantes: ['restaurante', 'restaurant', 'resto', 'menu', 'parrilla'],
  restaurant: ['restaurante', 'restaurant', 'resto', 'menu', 'parrilla'],
  almuerzo: ['almuerzo', 'menu', 'restaurante', 'comer', 'parrilla'],
  cena: ['cena', 'menu', 'restaurante', 'comer', 'parrilla'],
  comer: ['comer', 'menu', 'restaurante', 'parrilla', 'comida'],
  comida: ['comida', 'comer', 'menu', 'restaurante', 'gastronomy'],
  gastronomia: ['gastronomia', 'gastronomy', 'comer', 'restaurante', 'menu'],
  cafe: ['cafe', 'cafeteria', 'cafes'],
  cafeteria: ['cafe', 'cafeteria', 'cafes'],
  bar: ['bar', 'bares', 'nightlife', 'copas', 'trago'],
  bares: ['bar', 'bares', 'nightlife', 'copas', 'trago'],
  noche: ['noche', 'nocturna', 'nightlife', 'bar', 'copas'],
  copas: ['copas', 'bar', 'nightlife', 'trago', 'vino'],
  spa: ['spa', 'masajes', 'wellness'],
  termas: ['termas', 'termal', 'aguas termales'],
  relax: ['relax', 'spa', 'termas', 'bienestar', 'tranquilo'],
  bienestar: ['bienestar', 'wellness', 'spa', 'termas'],
  teatro: ['teatro', 'theatre', 'espectaculo'],
  espectaculo: ['espectaculo', 'teatro', 'theatre', 'show'],
  esqui: ['esqui', 'ski', 'nieve', 'snowboard'],
  ski: ['esqui', 'ski', 'nieve', 'snowboard'],
  nieve: ['nieve', 'esqui', 'ski', 'snowboard'],
  parque: ['parque', 'park', 'plaza', 'paseo'],
  plaza: ['plaza', 'parque', 'park', 'paseo'],
  paseo: ['paseo', 'parque', 'plaza', 'caminata'],
  mirador: ['mirador', 'viewpoint', 'vista', 'cerro'],
  // Never "familia": it is part of many winery names ("Familia Zuccardi").
  chicos: ['chicos', 'ninos', 'infantil', 'kids'],
  ninos: ['chicos', 'ninos', 'infantil', 'kids'],
  familia: ['familias', 'chicos', 'ninos', 'infantil'],
  merienda: ['merienda', 'cafe', 'facturas', 'pasteleria', 'torta'],
  desayuno: ['desayuno', 'brunch', 'cafe'],
  brunch: ['brunch', 'desayuno'],
  hamburguesa: ['hamburguesa', 'burger', 'hamburgueseria'],
  hamburguesas: ['hamburguesa', 'burger', 'hamburgueseria'],
  burger: ['hamburguesa', 'burger', 'hamburgueseria'],
  boliche: ['boliche', 'disco', 'bailar'],
  boliches: ['boliche', 'disco', 'bailar'],
  bailar: ['boliche', 'disco', 'bailar'],
  cultura: ['cultura', 'cultural', 'museo', 'teatro', 'arte', 'historia'],
  cultural: ['cultura', 'cultural', 'museo', 'teatro', 'arte', 'historia'],
  montana: ['montana', 'cordillera', 'cerro', 'alta montana'],
  pareja: [
    'pareja',
    'romantico',
    'romantica',
    'para dos',
    'dos personas',
    'dos adultos',
  ],
  degustacion: ['degustacion', 'cata', 'tasting'],
  degustaciones: ['degustacion', 'cata', 'tasting'],
  cata: ['degustacion', 'cata', 'tasting'],
  vegetariano: ['vegetariano', 'vegetariana', 'vegano', 'vegana', 'veggie'],
  vegetariana: ['vegetariano', 'vegetariana', 'vegano', 'vegana', 'veggie'],
  vegano: ['vegetariano', 'vegetariana', 'vegano', 'vegana', 'veggie'],
  italiana: ['italiana', 'italiano', 'pasta', 'pizza', 'trattoria'],
  pasta: ['pasta', 'italiana', 'trattoria', 'ravioles', 'sorrentinos'],
  pizza: ['pizza', 'pizzeria', 'pizzas'],
  helado: ['helado', 'heladeria', 'helados'],
  heladeria: ['helado', 'heladeria', 'helados'],
  parrilla: ['parrilla', 'parrillada', 'asado', 'carne'],
  asado: ['asado', 'parrilla', 'parrillada', 'carne'],
  'valle de uco': ['valle de uco', 'uco', 'tupungato', 'tunuyan', 'san carlos'],
  uco: ['valle de uco', 'uco', 'tupungato', 'tunuyan', 'san carlos'],
};

/** Multi-word names that must stay together (departments, landmarks). */
const KNOWN_PHRASES = [
  'lujan de cuyo',
  'ciudad de mendoza',
  'godoy cruz',
  'san rafael',
  'san carlos',
  'las heras',
  'san martin',
  'chacras de coria',
  'cerro de la gloria',
  'puente del inca',
  'valle de uco',
  'cerveza artesanal',
];

const FREE_WORDS = new Set(['gratis', 'gratuito', 'gratuita']);

/**
 * Words that ask for cheap things. They are a price condition, not text:
 * free, or a known price whose lower bound is at most CHEAP_PRICE_MAX_ARS
 * per person or group. An unknown price is never "cheap".
 */
const CHEAP_WORDS = new Set([
  'barato',
  'barata',
  'baratos',
  'baratas',
  'economico',
  'economica',
  'economicos',
  'economicas',
]);

/** Upper bound (ARS, lower price bound) of what "barato" matches. */
export const CHEAP_PRICE_MAX_ARS = 20000;

export interface SearchGroup {
  /** Normalised terms; the group matches when ANY of them matches. */
  terms: string[];
  /** Also matches activities whose price is positively FREE. */
  matchesFreePrice: boolean;
  /** The group is a price condition ("barato"), matched by price only. */
  cheapPrice?: boolean;
}

export interface ParsedSearch {
  /** The whole normalised phrase (for ranking). */
  phrase: string;
  /** Every group must match (AND). */
  groups: SearchGroup[];
}

export function parseSearch(search: string): ParsedSearch {
  const phrase = normalizeSearchText(search);
  let remaining = ` ${phrase} `;
  const units: string[] = [];

  for (const known of [...KNOWN_PHRASES].sort((a, b) => b.length - a.length)) {
    const needle = ` ${known} `;
    if (remaining.includes(needle)) {
      units.push(known);
      remaining = remaining.replace(needle, ' ');
    }
  }
  for (const word of remaining.split(' ')) {
    if (word && !STOPWORDS.has(word)) units.push(word);
  }
  if (units.length === 0 && phrase) units.push(phrase);

  const groups = units.map<SearchGroup>((unit) => {
    if (CHEAP_WORDS.has(unit)) {
      return { terms: [], matchesFreePrice: true, cheapPrice: true };
    }
    const terms = new Set<string>([unit, ...(SYNONYMS[unit] ?? [])]);
    return {
      terms: [...terms],
      matchesFreePrice:
        FREE_WORDS.has(unit) ||
        (SYNONYMS[unit] ?? []).some((t) => FREE_WORDS.has(t)),
    };
  });

  return { phrase, groups };
}

/**
 * POSIX regex that matches a term as a whole word (Spanish plural tolerated),
 * so "spa" never matches "España". Terms are already normalised [a-z0-9 ].
 */
export function wordPattern(term: string): string {
  const safe = term.replace(/[^a-z0-9 ]/g, '');
  return `\\m${safe}(s|es)?\\M`;
}
