/**
 * SmartPlan's controlled vocabularies. Two separate concepts, never mixed:
 *
 * - `PlaceKind` says what a physical place IS (a winery, a museum, a park).
 *   It is stored in `place.kind`.
 * - `ActivitySubtype` says what a person DOES (a tasting, rafting, a meal).
 *   It is stored in `activity.type`.
 *
 * Each entry carries its Spanish label, the top-level categories it belongs
 * to (the seeded English category names) and the plain words people use for
 * it. Search, filters, the catalog importer and the assistants all read from
 * here, so "bodega", "cerveza artesanal" or "termas" mean the same thing
 * everywhere. Keys are stable English identifiers; labels are display text.
 */

export type CategoryName =
  | 'Gastronomy'
  | 'Wine tourism'
  | 'Outdoors'
  | 'Adventure'
  | 'Culture'
  | 'Entertainment'
  | 'Nightlife'
  | 'Sports'
  | 'Live music'
  | 'Wellness'
  | 'Shopping'
  | 'Short trips';

export interface VocabularyEntry {
  label: string;
  categories: CategoryName[];
  /** Normalised search words (lowercase, no accents). */
  aliases: string[];
}

export const PLACE_KINDS = {
  winery: {
    label: 'Bodega',
    categories: ['Wine tourism'],
    aliases: ['bodega', 'winery', 'vino', 'vinos', 'enoturismo', 'vinedo'],
  },
  restaurant: {
    label: 'Restaurante',
    categories: ['Gastronomy'],
    aliases: ['restaurante', 'restaurant', 'resto', 'comer', 'comida'],
  },
  cafe: {
    label: 'Café',
    categories: ['Gastronomy'],
    aliases: ['cafe', 'cafeteria', 'merienda', 'desayuno'],
  },
  bakery: {
    label: 'Panadería y pastelería',
    categories: ['Gastronomy'],
    aliases: ['panaderia', 'pasteleria', 'merienda', 'facturas', 'tortas'],
  },
  ice_cream: {
    label: 'Heladería',
    categories: ['Gastronomy'],
    aliases: ['heladeria', 'helado', 'helados'],
  },
  bar: {
    label: 'Bar',
    categories: ['Nightlife'],
    aliases: ['bar', 'tragos', 'copas', 'cocteles'],
  },
  brewery: {
    label: 'Cervecería',
    categories: ['Nightlife', 'Gastronomy'],
    aliases: ['cerveceria', 'cerveza', 'cerveza artesanal', 'birra', 'pinta'],
  },
  nightclub: {
    label: 'Boliche',
    categories: ['Nightlife'],
    aliases: ['boliche', 'disco', 'bailar', 'fiesta'],
  },
  distillery: {
    label: 'Destilería',
    categories: ['Gastronomy'],
    aliases: ['destileria', 'gin', 'licor'],
  },
  olive_mill: {
    label: 'Olivícola',
    categories: ['Gastronomy'],
    aliases: ['olivicola', 'aceite de oliva', 'aceite', 'almazara', 'olivo'],
  },
  market: {
    label: 'Mercado y feria',
    categories: ['Shopping', 'Gastronomy'],
    aliases: ['mercado', 'feria', 'artesanias', 'puestos'],
  },
  shopping_center: {
    label: 'Centro comercial',
    categories: ['Shopping'],
    aliases: ['shopping', 'centro comercial', 'compras', 'tiendas'],
  },
  museum: {
    label: 'Museo',
    categories: ['Culture'],
    aliases: ['museo', 'cultura', 'arte', 'historia', 'exposicion'],
  },
  theatre: {
    label: 'Teatro',
    categories: ['Culture', 'Entertainment'],
    aliases: ['teatro', 'cultura', 'espectaculo', 'obra'],
  },
  cultural_center: {
    label: 'Centro cultural',
    categories: ['Culture'],
    aliases: ['centro cultural', 'cultura', 'arte', 'muestra'],
  },
  heritage: {
    label: 'Sitio histórico',
    categories: ['Culture'],
    aliases: ['historico', 'historia', 'patrimonio', 'cultura', 'ruinas'],
  },
  memorial: {
    label: 'Monumento',
    categories: ['Culture'],
    aliases: ['monumento', 'historia', 'cultura'],
  },
  park: {
    label: 'Parque',
    categories: ['Outdoors'],
    aliases: ['parque', 'paseo', 'aire libre', 'verde'],
  },
  plaza: {
    label: 'Plaza',
    categories: ['Outdoors'],
    aliases: ['plaza', 'paseo', 'aire libre'],
  },
  viewpoint: {
    label: 'Mirador',
    categories: ['Outdoors'],
    aliases: ['mirador', 'vista', 'paisaje', 'montana'],
  },
  mountain: {
    label: 'Cerro y montaña',
    categories: ['Outdoors'],
    aliases: ['cerro', 'montana', 'cumbre', 'trekking', 'senderismo'],
  },
  nature_reserve: {
    label: 'Reserva natural',
    categories: ['Outdoors', 'Short trips'],
    aliases: ['reserva', 'naturaleza', 'area protegida', 'fauna', 'montana'],
  },
  natural_monument: {
    label: 'Monumento natural',
    categories: ['Outdoors', 'Short trips'],
    aliases: ['monumento natural', 'naturaleza', 'paisaje', 'montana'],
  },
  reservoir: {
    label: 'Dique y embalse',
    categories: ['Outdoors'],
    aliases: ['dique', 'embalse', 'lago', 'agua'],
  },
  canyon: {
    label: 'Cañón',
    categories: ['Outdoors', 'Short trips'],
    aliases: ['canon', 'paisaje', 'naturaleza', 'excursion'],
  },
  hot_springs: {
    label: 'Termas',
    categories: ['Wellness'],
    aliases: ['termas', 'termal', 'aguas termales', 'relax', 'bienestar'],
  },
  spa: {
    label: 'Spa',
    categories: ['Wellness'],
    aliases: ['spa', 'masajes', 'relax', 'bienestar'],
  },
  ski_resort: {
    label: 'Centro de esquí',
    categories: ['Sports', 'Short trips'],
    aliases: ['esqui', 'ski', 'nieve', 'snowboard', 'montana'],
  },
  adventure_operator: {
    label: 'Operador de aventura',
    categories: ['Adventure'],
    aliases: ['aventura', 'excursion', 'turismo aventura'],
  },
  tour_operator: {
    label: 'Agencia de turismo',
    categories: ['Short trips'],
    aliases: ['agencia', 'agencia de viajes', 'agencia de turismo', 'tours'],
  },
  sports_venue: {
    label: 'Complejo deportivo',
    categories: ['Sports'],
    aliases: ['deporte', 'deportes', 'club', 'cancha'],
  },
  stadium: {
    label: 'Estadio',
    categories: ['Sports', 'Entertainment'],
    aliases: ['estadio', 'futbol', 'partido', 'deporte'],
  },
  amusement: {
    label: 'Entretenimiento',
    categories: ['Entertainment'],
    aliases: ['entretenimiento', 'juegos', 'diversion', 'ninos', 'chicos'],
  },
  cinema: {
    label: 'Cine',
    categories: ['Entertainment'],
    aliases: ['cine', 'pelicula', 'peliculas'],
  },
  zoo: {
    label: 'Zoológico y acuario',
    categories: ['Entertainment', 'Outdoors'],
    aliases: ['zoo', 'zoologico', 'acuario', 'animales', 'ninos', 'chicos'],
  },
  live_music_venue: {
    label: 'Música en vivo',
    categories: ['Live music', 'Nightlife'],
    aliases: ['musica en vivo', 'show', 'pena', 'recital', 'banda'],
  },
  visitor_center: {
    label: 'Centro de visitantes',
    categories: ['Culture'],
    aliases: ['centro de visitantes', 'informacion turistica'],
  },
} as const satisfies Record<string, VocabularyEntry>;

export const ACTIVITY_SUBTYPES = {
  tasting: {
    label: 'Degustación',
    categories: ['Wine tourism'],
    aliases: ['degustacion', 'cata', 'vino', 'vinos', 'malbec', 'bodega'],
  },
  winery_tour: {
    label: 'Visita a bodega',
    categories: ['Wine tourism'],
    aliases: ['visita guiada', 'bodega', 'vino', 'vinos', 'enoturismo'],
  },
  winery_meal: {
    label: 'Almuerzo en bodega',
    categories: ['Wine tourism', 'Gastronomy'],
    aliases: ['maridaje', 'almuerzo', 'bodega', 'vino', 'menu de pasos'],
  },
  meal: {
    label: 'Almuerzo o cena',
    categories: ['Gastronomy'],
    aliases: ['comer', 'comida', 'almuerzo', 'cena', 'restaurante'],
  },
  coffee: {
    label: 'Café y merienda',
    categories: ['Gastronomy'],
    aliases: ['cafe', 'merienda', 'desayuno', 'brunch'],
  },
  dessert: {
    label: 'Helado o postre',
    categories: ['Gastronomy'],
    aliases: ['helado', 'helados', 'heladeria', 'postre', 'postres', 'dulce'],
  },
  drinks: {
    label: 'Tragos',
    categories: ['Nightlife'],
    aliases: ['bar', 'tragos', 'copas', 'salir', 'cocteles'],
  },
  craft_beer: {
    label: 'Cerveza artesanal',
    categories: ['Nightlife', 'Gastronomy'],
    aliases: ['cerveza', 'cerveza artesanal', 'cerveceria', 'birra'],
  },
  dancing: {
    label: 'Salir a bailar',
    categories: ['Nightlife'],
    aliases: ['boliche', 'bailar', 'fiesta', 'disco'],
  },
  movie_screening: {
    label: 'Función de cine',
    categories: ['Entertainment'],
    aliases: ['cine', 'pelicula', 'peliculas', 'funcion de cine'],
  },
  live_show: {
    label: 'Espectáculo',
    categories: ['Entertainment', 'Culture'],
    aliases: ['espectaculo', 'show', 'teatro', 'funcion'],
  },
  live_music: {
    label: 'Música en vivo',
    categories: ['Live music'],
    aliases: ['musica en vivo', 'recital', 'pena', 'show'],
  },
  museum_visit: {
    label: 'Visita a museo',
    categories: ['Culture'],
    aliases: ['museo', 'cultura', 'arte', 'historia'],
  },
  guided_tour: {
    label: 'Visita guiada',
    categories: ['Culture'],
    aliases: ['visita guiada', 'recorrido', 'tour', 'cultura'],
  },
  heritage_visit: {
    label: 'Sitio histórico',
    categories: ['Culture'],
    aliases: ['historia', 'historico', 'patrimonio', 'cultura'],
  },
  walk: {
    label: 'Paseo',
    categories: ['Outdoors'],
    aliases: ['paseo', 'pasear', 'caminar', 'aire libre', 'parque'],
  },
  viewpoint_visit: {
    label: 'Mirador',
    categories: ['Outdoors'],
    aliases: ['mirador', 'vista', 'paisaje'],
  },
  day_trip: {
    label: 'Excursión',
    categories: ['Short trips', 'Outdoors'],
    aliases: ['excursion', 'escapada', 'paseo', 'montana'],
  },
  trekking: {
    label: 'Trekking',
    categories: ['Adventure', 'Outdoors'],
    aliases: ['trekking', 'senderismo', 'caminata', 'sendero', 'montana'],
  },
  rafting: {
    label: 'Rafting',
    categories: ['Adventure'],
    aliases: ['rafting', 'rapidos', 'balsa', 'rio', 'aventura'],
  },
  horseback_riding: {
    label: 'Cabalgata',
    categories: ['Adventure', 'Outdoors'],
    aliases: ['cabalgata', 'caballo', 'caballos', 'aventura'],
  },
  canopy: {
    label: 'Canopy y tirolesa',
    categories: ['Adventure'],
    aliases: ['canopy', 'tirolesa', 'aventura'],
  },
  kayak: {
    label: 'Kayak',
    categories: ['Adventure'],
    aliases: ['kayak', 'kayac', 'remo', 'aventura'],
  },
  climbing: {
    label: 'Escalada',
    categories: ['Adventure'],
    aliases: ['escalada', 'escalar', 'rapel', 'aventura', 'montana'],
  },
  paragliding: {
    label: 'Parapente',
    categories: ['Adventure'],
    aliases: ['parapente', 'vuelo', 'aventura'],
  },
  mountain_bike: {
    label: 'Bici y mountain bike',
    categories: ['Adventure', 'Sports'],
    aliases: ['bici', 'bicicleta', 'mountain bike', 'ciclismo'],
  },
  ski: {
    label: 'Esquí',
    categories: ['Sports', 'Short trips'],
    aliases: ['esqui', 'ski', 'nieve', 'snowboard'],
  },
  thermal_baths: {
    label: 'Termas',
    categories: ['Wellness'],
    aliases: ['termas', 'termal', 'aguas termales', 'relax', 'bienestar'],
  },
  spa_treatment: {
    label: 'Spa',
    categories: ['Wellness'],
    aliases: ['spa', 'masajes', 'relax', 'bienestar'],
  },
  workshop: {
    label: 'Clase o taller',
    categories: ['Culture'],
    aliases: ['clase', 'taller', 'curso', 'aprender'],
  },
  shopping: {
    label: 'Compras y ferias',
    categories: ['Shopping'],
    aliases: ['compras', 'feria', 'mercado', 'artesanias'],
  },
  sport_activity: {
    label: 'Deporte',
    categories: ['Sports'],
    aliases: ['deporte', 'deportes', 'jugar', 'partido'],
  },
  amusement: {
    label: 'Entretenimiento',
    categories: ['Entertainment'],
    aliases: ['entretenimiento', 'juegos', 'diversion'],
  },
} as const satisfies Record<string, VocabularyEntry>;

export type PlaceKind = keyof typeof PLACE_KINDS;
export type ActivitySubtype = keyof typeof ACTIVITY_SUBTYPES;

export function isPlaceKind(value: unknown): value is PlaceKind {
  return typeof value === 'string' && Object.hasOwn(PLACE_KINDS, value);
}

export function isActivitySubtype(value: unknown): value is ActivitySubtype {
  return typeof value === 'string' && Object.hasOwn(ACTIVITY_SUBTYPES, value);
}

/**
 * Free-text activity types written before the vocabulary existed (catalog
 * builds, admin forms, seeds), mapped to a subtype. Matched after
 * normalisation (lowercase, no accents).
 */
const LEGACY_ACTIVITY_TYPES: Record<string, ActivitySubtype> = {
  comida: 'meal',
  gastronomy: 'meal',
  gastronomia: 'meal',
  'visita a bodega': 'winery_tour',
  'experiencia en bodega': 'winery_tour',
  degustacion: 'tasting',
  rafting: 'rafting',
  cabalgata: 'horseback_riding',
  trekking: 'trekking',
  senderismo: 'trekking',
  salida: 'drinks',
  bar: 'drinks',
  museo: 'museum_visit',
  culture: 'guided_tour',
  cultura: 'guided_tour',
  'paseo urbano': 'walk',
  'paseo al aire libre': 'walk',
  paseo: 'walk',
  outdoors: 'walk',
  excursion: 'day_trip',
  mirador: 'viewpoint_visit',
  'mountain bike': 'mountain_bike',
  escalada: 'climbing',
  'sitio historico': 'heritage_visit',
  termas: 'thermal_baths',
  'paseo cultural': 'guided_tour',
  esqui: 'ski',
  espectaculo: 'live_show',
  kayak: 'kayak',
  parapente: 'paragliding',
  canopy: 'canopy',
  spa: 'spa_treatment',
};

function normalise(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** A vocabulary key for a stored type, or `null` when it cannot be mapped. */
export function toActivitySubtype(
  value: string | null | undefined,
): ActivitySubtype | null {
  if (!value) return null;
  if (isActivitySubtype(value)) return value;
  return LEGACY_ACTIVITY_TYPES[normalise(value)] ?? null;
}

const LEGACY_PLACE_KINDS: Record<string, PlaceKind> = {
  bodega: 'winery',
  restaurante: 'restaurant',
  cafeteria: 'cafe',
  cerveceria: 'brewery',
  boliche: 'nightclub',
  teatro: 'theatre',
  plaza: 'plaza',
  parque: 'park',
  termas: 'hot_springs',
};

export function toPlaceKind(
  value: string | null | undefined,
): PlaceKind | null {
  if (!value) return null;
  if (isPlaceKind(value)) return value;
  return LEGACY_PLACE_KINDS[normalise(value)] ?? null;
}

/** Display label of a place kind or activity subtype (or the raw value). */
export function placeKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return isPlaceKind(kind) ? PLACE_KINDS[kind].label : kind;
}

export function activitySubtypeLabel(
  subtype: string | null | undefined,
): string | null {
  if (!subtype) return null;
  return isActivitySubtype(subtype)
    ? ACTIVITY_SUBTYPES[subtype].label
    : subtype;
}

const escapeSql = (value: string): string => value.replace(/'/g, "''");

function searchTextSql(
  column: string,
  vocabulary: Record<string, VocabularyEntry>,
): string {
  const branches = Object.entries(vocabulary).map(([key, entry]) => {
    const words = [
      key.replace(/_/g, ' '),
      normalise(entry.label),
      ...entry.aliases,
    ].join(' ');
    return `WHEN '${escapeSql(key)}' THEN '${escapeSql(words)}'`;
  });
  return `(CASE ${column} ${branches.join(' ')} ELSE '' END)`;
}

/**
 * SQL expression with the searchable words of an activity subtype column, so
 * a search for "cabalgata" or "degustacion" finds activities by what they
 * are, not only by what their name happens to say.
 */
export function activitySubtypeSearchSql(column: string): string {
  return searchTextSql(column, ACTIVITY_SUBTYPES);
}

/** SQL expression with the Spanish label of an activity subtype column. */
export function activitySubtypeLabelSql(column: string): string {
  const branches = Object.entries(ACTIVITY_SUBTYPES).map(
    ([key, entry]) =>
      `WHEN '${escapeSql(key)}' THEN '${escapeSql(entry.label)}'`,
  );
  return `(CASE ${column} ${branches.join(' ')} ELSE 'Visita' END)`;
}

/** Same for a place kind column ("bodega" finds every winery). */
export function placeKindSearchSql(column: string): string {
  return searchTextSql(column, PLACE_KINDS);
}

/** The top-level categories a place kind implies (for place items). */
export function categoriesOfPlaceKind(
  kind: string | null | undefined,
): CategoryName[] {
  return isPlaceKind(kind) ? [...PLACE_KINDS[kind].categories] : [];
}

/** Every place kind whose categories include one of these names. */
export function placeKindsInCategories(names: string[]): PlaceKind[] {
  const wanted = new Set(names);
  return (Object.keys(PLACE_KINDS) as PlaceKind[]).filter((kind) =>
    (PLACE_KINDS[kind].categories as readonly string[]).some((name) =>
      wanted.has(name),
    ),
  );
}
