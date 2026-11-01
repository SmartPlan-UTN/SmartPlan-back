/**
 * Mendoza catalog v1 builder (v2 rules).
 *
 * PLACES come from licensed registries and open data:
 *   - Enoturismo registry 2019 (Datos Abiertos Mendoza, CC-BY-4.0): wineries.
 *   - Gastronomía en Mendoza 2019 (CC-BY-4.0): restaurants, cafés, bars...
 *   - Prestadores de turismo aventura 2018 (CC-BY-4.0): trade names only.
 *   - Ciudad de Mendoza plazas (CC-BY-4.0, with coordinates).
 *   - Wikidata (CC0): museums, heritage, parks, dams, theatres... with
 *     coordinates and, when available, a Commons photo (P18).
 *   - Áreas naturales protegidas (IDE Mendoza via datos abiertos, CC-BY-4.0).
 *   - The curated overlay (curated/NN-*.json), researched on official sites.
 *
 * ACTIVITIES come ONLY from the curated overlay: a registry row is a place,
 * never evidence that a tasting, a meal or a guided visit exists. Nothing is
 * generated from a template.
 *
 * Coordinates are SmartPlan-owned and from permitted sources only, in this
 * order: curated (official site / manual), Wikidata (CC0), Ciudad de Mendoza
 * layers matched by address (CC-BY-4.0), Georef geocoding (CC-BY-4.0). Google
 * contributes the Place ID only (reviewed matches), never content.
 *
 *   node build.cjs            # offline, from cached lookups
 *   FETCH=1 node build.cjs    # also fills the Georef/Commons caches
 */
const fs = require('fs');
const path = require('path');
const parse = require('./parse-csv.cjs');
const parseKml = require('./parse-kml.cjs');
const enrich = require('./enrich.cjs');
const { normalizeStreet, streetKey, addressParts } = require('./normalize-address.cjs');

const ROOT = __dirname;
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(OUT, { recursive: true });
const FETCH = process.env.FETCH === '1';

// A fixed verification date per build input, so rebuilding the same inputs
// yields the same package (and the same hash).
const REGISTRY_CHECKED = '2026-10-13';

const DEPARTMENTS = {
  CAPITAL: 'Ciudad de Mendoza',
  'GODOY CRUZ': 'Godoy Cruz',
  GUAYMALLEN: 'Guaymallén',
  MAIPU: 'Maipú',
  LUJAN: 'Luján de Cuyo',
  'LUJAN DE CUYO': 'Luján de Cuyo',
  'LAS HERAS': 'Las Heras',
  TUPUNGATO: 'Tupungato',
  TUNUYAN: 'Tunuyán',
  'SAN CARLOS': 'San Carlos',
  'SAN RAFAEL': 'San Rafael',
  'SAN MARTIN': 'San Martín',
  JUNIN: 'Junín',
  RIVADAVIA: 'Rivadavia',
  LAVALLE: 'Lavalle',
  MALARGUE: 'Malargüe',
  'GRAL. ALVEAR': 'General Alvear',
  'GRAL.ALVEAR': 'General Alvear',
};

/** Zones covered by this release. */
const ZONES = new Set([
  'Ciudad de Mendoza',
  'Godoy Cruz',
  'Guaymallén',
  'Maipú',
  'Luján de Cuyo',
  'Las Heras',
  'Tupungato',
  'Tunuyán',
  'San Carlos',
  'San Rafael',
]);

function fixEncoding(text) {
  // The 2019 registries are CP850 mis-decoded as latin1.
  return text
    .replace(/¥/g, 'Ñ')
    .replace(/à/g, 'Ó')
    .replace(/ï/g, 'Ó')
    .replace(/\u0090/g, 'É')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  const small = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'a']);
  return value
    .toLowerCase()
    .replace(/&/g, ' & ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, i) => {
      if (word.length === 0) return word;
      if (i > 0 && small.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const places = new Map();
const activities = new Map();
const stats = { coordinates: {} };

function addPlace(p) {
  if (places.has(p.slug)) return places.get(p.slug);
  places.set(p.slug, {
    description: '',
    latitude: '',
    longitude: '',
    coordinatesRef: '',
    kind: '',
    googlePlaceId: '',
    verifiedAt: REGISTRY_CHECKED,
    sourceRef: '',
    country: 'Argentina',
    city: 'Mendoza',
    imageUrl: '',
    imageLicense: '',
    imageAuthor: '',
    imageSourceUrl: '',
    ...p,
  });
  return places.get(p.slug);
}

// ------------------------------------------------------------ similarity
const STOP = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'bodega', 'bodegas', 'vinedos', 'vinedo', 'finca', 'restaurante', 'resto', 'restaurant', 'wines', 'wine', 'winery', 'familia', 'estate', 'cocina', 'bar', 'cafe', 'museo', 'parque', 'plaza']);
function toks(v) {
  const joined = String(v).replace(/\b([A-Za-z])\.(?=[A-Za-z]\b)/g, '$1');
  return slugify(joined).split('-').filter((t) => t && !STOP.has(t));
}
function similarity(a, b) {
  const l = toks(a);
  const r = toks(b);
  if (!l.length || !r.length) return slugify(a) === slugify(b) ? 1 : 0;
  const rs = new Set(r);
  return l.filter((t) => rs.has(t)).length / Math.min(l.length, r.length);
}
function findPlace(name, dept, kinds) {
  let best = null;
  let bestScore = 0;
  for (const p of places.values()) {
    if (kinds && !kinds.includes(p.kind)) continue;
    if (dept && p.department !== dept) continue;
    const sc = similarity(name, p.name);
    if (sc > bestScore) {
      best = p;
      bestScore = sc;
    }
  }
  return bestScore >= 0.75 ? best : null;
}

// ---------------------------------------------------------------- wineries
// Registry rows that are not a winery open to visitors are re-kinded by
// curated/place-kinds.json (e.g. a winery's restaurant or olive-oil house).
function loadWineries() {
  const rows = parse(fs.readFileSync(path.join(RAW, 'enoturismo.csv'), 'latin1'), ';').slice(1);
  for (const r of rows) {
    const raw = titleCase(fixEncoding(r[0] || ''));
    if (/verallia|grupo pe[ñn]aflor|cooperativa|ltda/i.test(raw)) continue;
    const dept = DEPARTMENTS[fixEncoding(r[4] || '').toUpperCase()];
    if (!raw || !dept || !ZONES.has(dept)) continue;
    const street = normalizeStreet(titleCase(fixEncoding(r[1] || '')));
    const number = fixEncoding(r[2] || '');
    let locality = titleCase(fixEncoding(r[3] || ''));
    if (/^(capital|ciudad)$/i.test(locality) || locality === dept) locality = '';
    if (!street) continue;
    // "Bodega X" / "Bodegas X" / "X Bodega": the place keeps its own name.
    const name = /bodega|wines?|vi[ñn]a|estate|finca|cava/i.test(raw) ? raw : `Bodega ${raw}`;
    const baseSlug = slugify(raw);
    const slug = baseSlug.startsWith('bodega') ? baseSlug : `bodega-${baseSlug}`;
    if (places.has(slug) || findPlace(name, dept, ['winery'])) continue;
    addPlace({
      slug,
      name,
      address: `${[street, number].filter(Boolean).join(' ')}${locality ? `, ${locality}` : ''}`,
      street,
      number,
      department: dept,
      kind: 'winery',
      locality,
      sourceRef: 'https://datosabiertos.mendoza.gov.ar/dataset/enoturismo',
      registry: 'enoturismo',
    });
  }
}

// -------------------------------------------------------------- gastronomy
const GASTRO_KIND = {
  RESTAURANTE: 'restaurant',
  RESTO: 'restaurant',
  PARRILLADA: 'restaurant',
  PIZZERIA: 'restaurant',
  'RESTO-BAR': 'restaurant',
  RESTOBAR: 'restaurant',
  'CAF-RESTO': 'restaurant',
  CANTINA: 'restaurant',
  COMEDOR: 'restaurant',
  SANDWICHERIA: 'restaurant',
  LOMITERIA: 'restaurant',
  'BAR Y PIZZERIA': 'restaurant',
  VEGETERIANO: 'restaurant',
  CAFETERIA: 'cafe',
  CAF: 'cafe',
  CAFERRIA: 'cafe',
  CEFETERIA: 'cafe',
  'CAF-BAR': 'cafe',
  'CAF-PASTELERIA': 'cafe',
  CONFITERIA: 'cafe',
  'CONFITERIA-BAR': 'cafe',
  'SALON DE TE': 'cafe',
  'CASA DE TE': 'cafe',
  CHOCOLATERIA: 'bakery',
  PASTELERIA: 'bakery',
  PANADERIA: 'bakery',
  DULCERIA: 'bakery',
  HELADERIA: 'ice_cream',
  'CAF-HELADERIA': 'ice_cream',
  BAR: 'bar',
  PUB: 'bar',
  'CARRITO-BAR': 'bar',
  'SNACK-BAR': 'bar',
  'WINE BAR': 'bar',
  'CONF.BAILABLE': 'nightclub',
  DISCOTECA: 'nightclub',
  'RESTO-DISCO': 'nightclub',
};

const NOT_A_VENUE =
  /expedicion|turismo|agencia|hotel|hostel|hosteria|caba[ñn]a|apart|lodge|camping|verallia|ltda|cooperativa|grupo pe[ñn]aflor|patio de comidas|s\.?\s?r\.?\s?l\.?$|s\.?a\.?$/i;
const CHAINS =
  /mc\.?\s*donald|burger king|starbucks|subway|mostaza|grido|freddo|havanna|kfc|wendy|pizza hut|carrefour|walmart|\bdisco\b|jumbo|\bd\.?k\.?\b/i;

function gastroKind(rubro, name) {
  const base = GASTRO_KIND[rubro];
  if (!base) return null;
  if (/cervec|brew|beer|birra/i.test(name)) return 'brewery';
  return base;
}

function loadGastronomy() {
  const rows = parse(fs.readFileSync(path.join(RAW, 'gastronomia.csv'), 'latin1'), ';').slice(1);
  for (const r of rows) {
    const rubro = fixEncoding(r[0] || '')
      .toUpperCase()
      .replace(/[^A-Z .\-]/g, '')
      .trim();
    const dept = DEPARTMENTS[fixEncoding(r[5] || '').toUpperCase()];
    if (!dept || !ZONES.has(dept)) continue;
    const name = titleCase(fixEncoding(r[1] || ''));
    const kind = gastroKind(rubro, name);
    if (!kind) continue;
    if (!name || name.length < 3 || CHAINS.test(name) || NOT_A_VENUE.test(name)) continue;
    const street = normalizeStreet(titleCase(fixEncoding(r[2] || '')));
    const number = fixEncoding(r[3] || '');
    if (!street) continue;
    const slug = slugify(`${name}-${dept}`);
    if (places.has(slug)) continue;
    // A winery's own restaurant is the winery's place, not a second place.
    if (findPlace(name, dept, ['winery'])) continue;
    addPlace({
      slug,
      name,
      address: `${street}${number ? ` ${number}` : ''}`,
      street,
      number,
      department: dept,
      kind,
      sourceRef: 'https://datosabiertos.mendoza.gov.ar/dataset/gastronomia-en-mendoza',
      registry: 'gastronomia',
    });
  }
}

// ------------------------------------------------------ adventure operators
function loadAdventure() {
  const file = path.join(RAW, 'aventura-2018.csv');
  if (!fs.existsSync(file)) return;
  const rows = parse(fs.readFileSync(file, 'latin1'), ';').slice(1);
  for (const r of rows) {
    const fantasy = fixEncoding(r[1] || '');
    const dept = DEPARTMENTS[fixEncoding(r[9] || '').toUpperCase()];
    if (!fantasy || /^disponible$/i.test(fantasy) || !dept || !ZONES.has(dept)) continue;
    const name = titleCase(fantasy);
    const street = normalizeStreet(titleCase(fixEncoding(r[4] || '')));
    const number = fixEncoding(r[5] || '');
    const locality = titleCase(fixEncoding(r[8] || ''));
    if (!street) continue;
    const slug = slugify(`${name}-${dept}`);
    if (places.has(slug)) continue;
    addPlace({
      slug,
      name,
      address: `${street}${number ? ` ${number}` : ''}${locality && locality !== dept ? `, ${locality}` : ''}`,
      street,
      number,
      department: dept,
      kind: 'adventure_operator',
      sourceRef: 'https://datosabiertos.mendoza.gov.ar/dataset/prestadores-de-turismo-aventura',
      registry: 'aventura',
    });
  }
}

// ------------------------------------------------------------- municipal
function loadPlazas() {
  const rows = parse(fs.readFileSync(path.join(RAW, 'plazas.csv'), 'utf8')).slice(1);
  for (const r of rows) {
    const name = (r[0] || '').trim();
    const lat = parseFloat(r[1]);
    const lon = parseFloat(r[2]);
    if (!name || Number.isNaN(lat)) continue;
    addPlace({
      slug: slugify(name),
      name,
      address: `${name}, Ciudad de Mendoza`,
      department: 'Ciudad de Mendoza',
      kind: 'plaza',
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
      coordinatesRef: 'https://datos.ciudaddemendoza.gob.ar/dataset/plazas-mendoza',
      sourceRef: 'https://datos.ciudaddemendoza.gob.ar/dataset/plazas-mendoza',
    });
  }
}

// --------------------------------------------------------------- Wikidata
const WD_KIND = [
  [/^museo/i, 'museum'],
  [/^teatro/i, 'theatre'],
  [/zoológico/i, 'zoo'],
  [/^estadio/i, 'stadium'],
  [/^parque$/i, 'park'],
  [/^plaza$/i, 'plaza'],
  [/represa|embalse/i, 'reservoir'],
  [/área protegida|reserva natural|reserva de biosfera/i, 'nature_reserve'],
  [/aguas termales/i, 'hot_springs'],
  [/cascada/i, 'natural_monument'],
  [/catedral|basílica|iglesia/i, 'heritage'],
  [/^bodega$/i, 'winery'],
  [/^monumento/i, 'memorial'],
  [/^patrimonio$/i, 'heritage'],
];
// Heritage that is a visitable site, not a school, office or survey point.
const VISITABLE_HERITAGE =
  /capilla|iglesia|templo|ruinas|b[óo]vedas|cristo redentor|termas|fuerte|molino|plaza|parque|bodega|casa de|casona|chalet|monumento|museo|toma de los|puente del inca|cerro de la gloria|balneario/i;
const NOT_VISITABLE = /escuela|colegio|punto inicial|punto final|subtramo|secci[óo]n|combate|campo del|edificio g[óo]mez|universidad|hospital|banco/i;

async function loadWikidata() {
  const rows = parse(fs.readFileSync(path.join(RAW, 'wd-mendoza.csv'), 'utf8')).slice(1);
  const images = fs.existsSync(path.join(RAW, 'wd-images.csv'))
    ? new Map(
        parse(fs.readFileSync(path.join(RAW, 'wd-images.csv'), 'utf8'))
          .slice(1)
          .map((r) => [r[0], r[4]]),
      )
    : new Map();
  const seen = new Set();
  for (const r of rows) {
    const [item, label, latRaw, lonRaw, site, typeLabel] = r;
    if (seen.has(item)) continue;
    const rule = WD_KIND.find(([re]) => re.test(typeLabel || ''));
    if (!rule) continue;
    let kind = rule[1];
    if (kind === 'heritage' || kind === 'memorial') {
      if (!VISITABLE_HERITAGE.test(label) || NOT_VISITABLE.test(label)) continue;
      if (/capilla|iglesia|templo|catedral|bas[ií]lica/i.test(label)) kind = 'heritage';
    }
    if (/^Q\d+$/.test(label)) continue; // no Spanish label
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const dept = await enrich.departmentAt(lat, lon, { fetchMissing: FETCH });
    if (!dept || !ZONES.has(dept)) continue;
    seen.add(item);
    const existing = findPlace(label, dept, null);
    const commonsRef = images.get(item);
    const image = commonsRef ? await enrich.commonsImage(commonsRef, { fetchMissing: FETCH }) : null;
    if (existing) {
      // Wikidata confirms a place we already have: take its open coordinates
      // and photo, keep everything else.
      if (!existing.latitude) {
        existing.latitude = lat.toFixed(6);
        existing.longitude = lon.toFixed(6);
        existing.coordinatesRef = item.replace('http://', 'https://');
      }
      if (image && !existing.imageUrl) applyImage(existing, image);
      continue;
    }
    const place = addPlace({
      slug: slugify(`${label}-${dept}`),
      name: label.length > 150 ? label.slice(0, 147) + '…' : label,
      address: `${label.length > 60 ? label.slice(0, 60) : label}, ${dept}`,
      department: dept,
      kind,
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
      coordinatesRef: item.replace('http://', 'https://'),
      sourceRef: (site && /^https?:\/\//.test(site) ? site : item).replace('http://www.wikidata', 'https://www.wikidata'),
      registry: 'wikidata',
    });
    if (image) applyImage(place, image);
  }
}

function applyImage(place, image) {
  place.imageUrl = image.url;
  place.imageLicense = image.license;
  place.imageAuthor = image.author || '';
  place.imageSourceUrl = image.sourceUrl;
}

// --------------------------------------------------- protected areas (IDE)
async function loadProtectedAreas() {
  const rows = parseKml(path.join(RAW, 'kml-areas', 'doc.kml'));
  for (const row of rows) {
    const name = row.attrs.nombre || row.name;
    if (!name || row.lat === null) continue;
    const dept = DEPARTMENTS[norm(row.attrs.departamen).toUpperCase()] || row.attrs.departamen;
    if (!ZONES.has(dept)) continue;
    if (findPlace(name, dept, null)) continue;
    addPlace({
      slug: slugify(`${name}-${dept}`),
      name: titleCase(name).replace(/\bLa\b/, 'la'),
      address: `${name}, ${dept}`,
      department: dept,
      kind: 'nature_reserve',
      // The KML gives one vertex of the area's outline: a point inside or on
      // the edge of the reserve, good enough to place it on the map.
      latitude: row.lat.toFixed(6),
      longitude: row.lon.toFixed(6),
      coordinatesRef: 'https://datosabiertos.mendoza.gov.ar/dataset/areas-naturales-protegidas',
      sourceRef: 'https://datosabiertos.mendoza.gov.ar/dataset/areas-naturales-protegidas',
    });
  }
}

// --------------------------------------------------------------- curated
const LEGACY_TYPES = {
  comida: 'meal', 'visita a bodega': 'winery_tour', 'experiencia en bodega': 'winery_tour',
  degustacion: 'tasting', rafting: 'rafting', cabalgata: 'horseback_riding', trekking: 'trekking',
  salida: 'drinks', museo: 'museum_visit', 'paseo urbano': 'walk', 'paseo al aire libre': 'walk',
  paseo: 'walk', excursion: 'day_trip', mirador: 'viewpoint_visit', 'mountain bike': 'mountain_bike',
  escalada: 'climbing', 'sitio historico': 'heritage_visit', termas: 'thermal_baths',
  'paseo cultural': 'guided_tour', esqui: 'ski', espectaculo: 'live_show', kayak: 'kayak',
  parapente: 'paragliding', canopy: 'canopy', spa: 'spa_treatment',
};
const SUBTYPE_CATEGORIES = {
  tasting: ['Wine tourism'], winery_tour: ['Wine tourism'], winery_meal: ['Wine tourism', 'Gastronomy'],
  meal: ['Gastronomy'], coffee: ['Gastronomy'], drinks: ['Nightlife'], craft_beer: ['Nightlife', 'Gastronomy'],
  dancing: ['Nightlife'], live_show: ['Entertainment', 'Culture'], live_music: ['Live music'],
  museum_visit: ['Culture'], guided_tour: ['Culture'], heritage_visit: ['Culture'], walk: ['Outdoors'],
  viewpoint_visit: ['Outdoors'], day_trip: ['Short trips', 'Outdoors'], trekking: ['Adventure', 'Outdoors'],
  rafting: ['Adventure'], horseback_riding: ['Adventure', 'Outdoors'], canopy: ['Adventure'],
  kayak: ['Adventure'], climbing: ['Adventure'], paragliding: ['Adventure'],
  mountain_bike: ['Adventure', 'Sports'], ski: ['Sports', 'Short trips'], thermal_baths: ['Wellness'],
  spa_treatment: ['Wellness'], workshop: ['Culture'], shopping: ['Shopping'],
  sport_activity: ['Sports'], amusement: ['Entertainment'],
};
const KNOWN_PLACE_KINDS = new Set(['winery', 'restaurant', 'cafe', 'bakery', 'ice_cream', 'bar', 'brewery', 'nightclub', 'distillery', 'olive_mill', 'market', 'shopping_center', 'museum', 'theatre', 'cultural_center', 'heritage', 'memorial', 'park', 'plaza', 'viewpoint', 'mountain', 'nature_reserve', 'natural_monument', 'reservoir', 'canyon', 'hot_springs', 'spa', 'ski_resort', 'adventure_operator', 'sports_venue', 'stadium', 'amusement', 'cinema', 'zoo', 'live_music_venue', 'visitor_center']);

function subtypeOf(type) {
  if (!type) return '';
  if (SUBTYPE_CATEGORIES[type]) return type;
  const mapped = LEGACY_TYPES[norm(type)];
  if (!mapped) throw new Error(`Unknown activity type "${type}": use a key of src/catalog/taxonomy.ts`);
  return mapped;
}

/** Category names derived from the subtype, plus any curated extra. */
function categoriesOf(subtype, curated) {
  const fromSubtype = SUBTYPE_CATEGORIES[subtype] || [];
  // A wine experience is Wine tourism first, whatever an older file said.
  const extra = [].concat(curated || []).filter((c) => !(fromSubtype.includes('Wine tourism') && c === 'Gastronomy' && subtype !== 'winery_meal'));
  return [...new Set([...fromSubtype, ...extra])];
}

function loadCurated() {
  const dir = path.join(ROOT, 'curated');
  for (const file of fs.readdirSync(dir).filter((f) => /^[0-9]{2}-.*[.]json$/.test(f)).sort()) {
    const items = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const item of items) {
      const placeSlug = item.place.slug || slugify(item.place.name);
      const overrides = Object.fromEntries(
        Object.entries(item.place).filter(([, v]) => v !== undefined && v !== ''),
      );
      if (overrides.image) {
        applyImage(overrides, overrides.image);
        delete overrides.image;
      }
      const existing = places.get(placeSlug);
      if (overrides.address) {
        Object.assign(overrides, addressParts(overrides.address));
        if (existing && existing.address !== overrides.address && !overrides.latitude &&
            /georef|datos[.]ciudaddemendoza/.test(existing.coordinatesRef || '')) {
          // A previous street-address point must not survive a venue move.
          overrides.latitude = '';
          overrides.longitude = '';
          overrides.coordinatesRef = '';
        }
      }
      if (existing) {
        Object.assign(existing, overrides);
        existing.slug = placeSlug;
        if (overrides.latitude && !overrides.coordinatesRef) {
          existing.coordinatesRef = item.place.sourceRef || existing.coordinatesRef;
        }
      } else {
        addPlace({
          ...overrides,
          coordinatesRef: overrides.coordinatesRef || (overrides.latitude ? overrides.sourceRef || '' : ''),
          slug: placeSlug,
          curated: true,
        });
      }
      for (const act of item.activities || []) {
        const slug = act.slug || slugify(act.name);
        const subtype = subtypeOf(act.type);
        const price = act.price || {};
        if (activities.has(slug)) throw new Error(`Duplicate activity slug ${slug} (${file})`);
        activities.set(slug, {
          slug,
          name: act.name,
          description: act.description,
          durationMinutes: String(act.durationMinutes),
          minPeople: act.minPeople ?? '',
          maxPeople: act.maxPeople ?? '',
          type: subtype,
          categories: categoriesOf(subtype, act.categories).join(';'),
          places: [].concat(act.places || placeSlug).join(';'),
          priceKind: price.kind || '',
          priceMin: price.min ?? '',
          priceMax: price.max ?? '',
          priceUnit: price.unit || '',
          priceSource: price.source || '',
          priceSourceRef: price.sourceRef || '',
          priceVerifiedAt: price.verifiedAt || '',
          verifiedAt: act.verifiedAt || REGISTRY_CHECKED,
          availableMonths: (act.availableMonths || []).join(';'),
        });
      }
    }
  }
}

// ----------------------------------------------------------- coordinates
async function resolveCoordinates() {
  // Ciudad de Mendoza commerce layers (CC-BY-4.0): coordinates by address.
  const cityLayers = ['restaurantes', 'cafeterias', 'heladerias', 'vinotecas']
    .flatMap((layer) => parseKml(path.join(RAW, `kml-${layer}`, 'doc.kml')))
    .filter((row) => row.lat !== null && row.attrs.calle);
  const byAddress = new Map();
  for (const row of cityLayers) {
    const key = `${streetKey(row.attrs.calle)}|${String(row.attrs.numero).trim()}`;
    // Conflicting municipal rows are not an unambiguous address match.
    const previous = byAddress.get(key);
    byAddress.set(key, byAddress.has(key) && (!previous || previous.lat !== row.lat || previous.lon !== row.lon) ? null : row);
  }
  for (const place of places.values()) {
    if (place.latitude) {
      stats.coordinates[place.coordinatesRef.includes('wikidata') ? 'wikidata' : 'curated/open'] =
        (stats.coordinates[place.coordinatesRef.includes('wikidata') ? 'wikidata' : 'curated/open'] || 0) + 1;
      continue;
    }
    if (place.department === 'Ciudad de Mendoza' && place.street && place.number) {
      const hit = byAddress.get(`${streetKey(place.street)}|${String(place.number).trim()}`);
      if (hit) {
        place.latitude = hit.lat.toFixed(6);
        place.longitude = hit.lon.toFixed(6);
        place.coordinatesRef = 'https://datos.ciudaddemendoza.gob.ar/dataset/restaurantes-parrilladas-y-pizzerias';
        stats.coordinates['ciudad-layers'] = (stats.coordinates['ciudad-layers'] || 0) + 1;
        continue;
      }
    }
    const geo = await enrich.geocode(place.street, place.number, place.department, { fetchMissing: FETCH });
    if (geo) {
      place.latitude = geo.lat.toFixed(6);
      place.longitude = geo.lon.toFixed(6);
      place.coordinatesRef = 'https://apis.datos.gob.ar/georef/api/direcciones';
      stats.coordinates.georef = (stats.coordinates.georef || 0) + 1;
    } else {
      stats.coordinates.none = (stats.coordinates.none || 0) + 1;
    }
  }
}

// ------------------------------------------------------------- reviewed
function applyReviewedDecisions() {
  const kindsFile = path.join(ROOT, 'curated', 'place-kinds.json');
  if (fs.existsSync(kindsFile)) {
    for (const [slug, fix] of Object.entries(JSON.parse(fs.readFileSync(kindsFile, 'utf8')))) {
      const place = places.get(slug);
      if (!place) continue;
      if (fix.kind) place.kind = fix.kind;
      if (fix.name) place.name = fix.name;
    }
  }
  const idsFile = path.join(ROOT, 'curated', 'google-place-ids.json');
  if (fs.existsSync(idsFile)) {
    for (const [slug, id] of Object.entries(JSON.parse(fs.readFileSync(idsFile, 'utf8')))) {
      const place = places.get(slug);
      if (place) place.googlePlaceId = id;
    }
  }
  for (const decisionsFile of ['rejected-identities.json', 'unconfirmed-identities.json']) {
    const rejectedFile = path.join(ROOT, 'curated', decisionsFile);
    if (fs.existsSync(rejectedFile)) {
      for (const slug of Object.keys(JSON.parse(fs.readFileSync(rejectedFile, 'utf8')))) {
        const place = places.get(slug);
        if (place) place.googlePlaceId = '';
      }
    }
  }
  const droppedFile = path.join(ROOT, 'curated', 'dropped-places.json');
  if (fs.existsSync(droppedFile)) {
    for (const [slug, reason] of Object.entries(JSON.parse(fs.readFileSync(droppedFile, 'utf8')))) {
      const place = places.get(slug);
      if (!place) continue;
      // Google not finding (or not clearly finding) a place only matters for
      // registry rows whose existence it was meant to confirm. A place with
      // its own open coordinates (Wikidata, municipal data, official site)
      // stays; a permanently closed one never does.
      const unconfirmed = /^google:(unmatched|ambiguous)$/.test(reason);
      const needsConfirmation = ["enoturismo", "gastronomia", "aventura"].includes(place.registry);
      if (unconfirmed && !needsConfirmation && place.latitude) continue;
      places.delete(slug);
    }
  }
}

/** Explicitly reviewed aliases; never infer a merge from a provider ID alone. */
function applyPlaceAliases() {
  const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'curated', 'place-aliases.json'), 'utf8'));
  for (const [alias, canonicalSlug] of Object.entries(aliases)) {
    const duplicate = places.get(alias);
    const canonical = places.get(canonicalSlug);
    if (!duplicate || !canonical) continue;
    if (duplicate.latitude && (!canonical.latitude || !canonical.coordinatesRef)) {
      canonical.latitude = duplicate.latitude;
      canonical.longitude = duplicate.longitude;
      canonical.coordinatesRef = duplicate.coordinatesRef;
    }
    if (duplicate.imageUrl && !canonical.imageUrl) {
      for (const key of ['imageUrl', 'imageLicense', 'imageAuthor', 'imageSourceUrl']) canonical[key] = duplicate[key];
    }
    places.delete(alias);
    for (const activity of activities.values()) {
      activity.places = [...new Set(activity.places.split(';').map((slug) => slug === alias ? canonicalSlug : slug))].join(';');
    }
  }
}

// ------------------------------------------------------------- checks
function qualityChecks() {
  const problems = [];
  const byDescription = new Map();
  for (const a of activities.values()) {
    if (/^visita y degustaci[óo]n en |^comer en |^tomar un caf[ée] en |^salir a (bailar|tomar algo) |^(rafting|trekking|cabalgata|kayak|parapente|escalada|mountain bike) con /i.test(a.name)) {
      problems.push(`generated-looking activity name: ${a.slug} "${a.name}"`);
    }
    const key = norm(a.description).slice(0, 120);
    byDescription.set(key, [...(byDescription.get(key) || []), a.slug]);
    if (!a.description || a.description.length < 40) problems.push(`short description: ${a.slug}`);
    for (const ref of a.places.split(';')) {
      if (!places.has(ref)) problems.push(`activity ${a.slug} references unknown place ${ref}`);
    }
  }
  for (const [, slugs] of byDescription) {
    if (slugs.length > 2) problems.push(`repeated description x${slugs.length}: ${slugs.slice(0, 4).join(', ')}`);
  }
  for (const p of places.values()) {
    if (p.kind && !KNOWN_PLACE_KINDS.has(p.kind)) problems.push(`unknown place kind ${p.kind}: ${p.slug}`);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    throw new Error(`${problems.length} catalog quality problem(s)`);
  }
}

function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file, columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

(async () => {
  loadWineries();
  loadGastronomy();
  loadAdventure();
  loadPlazas();
  await loadWikidata();
  await loadProtectedAreas();
  loadCurated();
  applyReviewedDecisions();
  applyPlaceAliases();
  const experiencesInReview = JSON.parse(fs.readFileSync(path.join(ROOT, 'curated', 'experience-review.json'), 'utf8'));
  for (const slug of Object.keys(experiencesInReview)) activities.delete(slug);
  await resolveCoordinates();
  enrich.persist();

  for (const [slug, a] of [...activities.entries()]) {
    if (a.places.split(';').some((r) => !places.has(r))) {
      console.warn(`activity ${slug} references a dropped/unknown place; dropped`);
      activities.delete(slug);
    }
  }
  qualityChecks();

  const sorted = (m) => [...m.values()].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  writeCsv(
    path.join(OUT, 'places.csv'),
    ['slug', 'name', 'description', 'address', 'country', 'city', 'department',
      'latitude', 'longitude', 'kind', 'googlePlaceId', 'verifiedAt', 'sourceRef',
      'coordinatesRef', 'imageUrl', 'imageLicense', 'imageAuthor', 'imageSourceUrl'],
    sorted(places),
  );
  writeCsv(
    path.join(OUT, 'activities.csv'),
    ['slug', 'name', 'description', 'durationMinutes', 'type', 'categories', 'places',
      'priceKind', 'priceMin', 'priceMax', 'priceUnit', 'priceSource', 'priceSourceRef',
      'priceVerifiedAt', 'verifiedAt', 'availableMonths', 'minPeople', 'maxPeople'],
    sorted(activities),
  );
  const byKind = {};
  for (const p of places.values()) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  console.log(`places=${places.size} activities=${activities.size}`);
  console.log('places by kind', JSON.stringify(byKind));
  console.log('coordinates', JSON.stringify(stats.coordinates));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
