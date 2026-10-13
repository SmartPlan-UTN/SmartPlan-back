/**
 * Mendoza catalog v1 builder.
 *
 * Reads the raw open-data downloads (catalog-data/mendoza-v1/raw, not
 * versioned) and the curated editorial overlay (curated/*.json, versioned) and
 * writes data/places.csv + data/activities.csv for `pnpm catalog csv-to-package`.
 *
 * Nothing here copies provider (Google) content. Coordinates come only from
 * Wikidata (CC0), the municipal open-data portal (CC-BY-4.0) or the curated
 * overlay. See SOURCES.md for licences.
 */
const fs = require('fs');
const path = require('path');
const parse = require('./parse-csv.cjs');

const ROOT = __dirname;
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(OUT, { recursive: true });

const TODAY = new Date().toISOString().slice(0, 10);

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

/** Zones covered by this release (San Rafael/Malargüe etc. come later). */
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
      // keep acronyms like "S.A." out; simple capitalisation
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(new RegExp("[\u0300-\u036f]", "g"), '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const REGION = {
  Tupungato: 'Valle de Uco',
  'Tunuyán': 'Valle de Uco',
  'San Carlos': 'Valle de Uco',
  'San Rafael': 'Zona Sur',
};
const regionOf = (dept) => (REGION[dept] ? `${dept} (${REGION[dept]})` : dept);

const places = new Map();
const activities = new Map();

function addPlace(p) {
  if (places.has(p.slug)) return places.get(p.slug);
  places.set(p.slug, {
    description: '',
    latitude: '',
    longitude: '',
    kind: '',
    googlePlaceId: '',
    verifiedAt: TODAY,
    sourceRef: '',
    country: 'Argentina',
    city: 'Mendoza',
    ...p,
  });
  return places.get(p.slug);
}

function addActivity(a) {
  if (activities.has(a.slug)) return;
  activities.set(a.slug, {
    type: '',
    priceKind: '',
    priceMin: '',
    priceMax: '',
    priceUnit: '',
    priceSource: '',
    priceSourceRef: '',
    priceVerifiedAt: '',
    verifiedAt: TODAY,
    ...a,
  });
}

// ---------------------------------------------------------------- bodegas
function loadBodegas() {
  const rows = parse(
    fs.readFileSync(path.join(RAW, 'enoturismo.csv'), 'latin1'),
    ';',
  ).slice(1);
  const seen = new Set();
  for (const r of rows) {
    const name = titleCase(fixEncoding(r[0] || ''));
    if (/verallia|grupo pe[ñn]aflor|cooperativa|ltda/i.test(name)) continue;
    const dept = DEPARTMENTS[fixEncoding(r[4] || '').toUpperCase()];
    if (!name || !dept || !ZONES.has(dept)) continue;
    const street = titleCase(fixEncoding(r[1] || ''));
    const number = fixEncoding(r[2] || '');
    let locality = titleCase(fixEncoding(r[3] || ''));
    if (/^(capital|ciudad)$/i.test(locality) || locality === dept) locality = '';
    if (!street) continue; // no address at all
    const address = [street, number].filter(Boolean).join(' ').trim();
    const baseSlug = slugify(name);
    if (seen.has(baseSlug)) continue; // registry duplicates (same winery twice)
    if (findPlace(name, dept, ['winery'])) continue; // near-duplicate entry
    seen.add(baseSlug);
    const slug = baseSlug.startsWith('bodega') ? baseSlug : `bodega-${baseSlug}`;
    const clean = name.replace(/^Bodegas?\s+/i, '');
    const placeName = /^bodega/i.test(name) ? name : `Bodega ${name}`;
    addPlace({
      slug,
      name: placeName,
      address: `${address}${locality ? `, ${locality}` : ''}`,
      department: dept,
      kind: 'winery',
      sourceRef:
        'https://datosabiertos.mendoza.gov.ar/dataset/enoturismo',
      description: `Bodega ubicada en ${locality ? `${locality}, ` : ''}${regionOf(dept)}, incluida en el registro oficial de bodegas con oferta de enoturismo del Ente Mendoza Turismo.`,
    });
    addActivity({
      slug: `visita-${slug}`,
      name: `Visita y degustación en ${clean || placeName}`,
      description: `Recorrido por la bodega y degustación de sus vinos en ${locality ? `${locality}, ` : ''}${regionOf(dept)}. La bodega figura en el registro oficial de enoturismo de Mendoza; conviene confirmar horarios y reserva antes de ir.`,
      durationMinutes: '90',
      type: 'Visita a bodega',
      categories: 'Gastronomy',
      places: slug,
    });
  }
}

// -------------------------------------------------------------- gastronomy
const GASTRO_KIND = {
  'CONF.BAILABLE': { kind: 'bar', cat: 'Nightlife', dur: 180, label: 'Salir a bailar a' },
  DISCOTECA: { kind: 'bar', cat: 'Nightlife', dur: 180, label: 'Salir a bailar a' },
  'RESTO-DISCO': { kind: 'bar', cat: 'Nightlife', dur: 180, label: 'Salir a bailar a' },
  'CARRITO-BAR': { kind: 'bar', cat: 'Nightlife', dur: 90, label: 'Salir a tomar algo en' },
  'CAF\u0090-BAR': { kind: 'cafe', cat: 'Gastronomy', dur: 60, label: 'Tomar un café en' },
  RESTAURANTE: { kind: 'restaurant', cat: 'Gastronomy', dur: 90, label: 'Comer en' },
  PARRILLADA: { kind: 'restaurant', cat: 'Gastronomy', dur: 90, label: 'Comer en' },
  PIZZERIA: { kind: 'restaurant', cat: 'Gastronomy', dur: 75, label: 'Comer en' },
  'RESTO-BAR': { kind: 'restaurant', cat: 'Gastronomy', dur: 90, label: 'Comer en' },
  RESTOBAR: { kind: 'restaurant', cat: 'Gastronomy', dur: 90, label: 'Comer en' },
  BAR: { kind: 'bar', cat: 'Nightlife', dur: 120, label: 'Salir a tomar algo en' },
  PUB: { kind: 'bar', cat: 'Nightlife', dur: 120, label: 'Salir a tomar algo en' },
  'WINE BAR': { kind: 'bar', cat: 'Nightlife', dur: 90, label: 'Probar vinos en' },
  CAFETERIA: { kind: 'cafe', cat: 'Gastronomy', dur: 60, label: 'Tomar un café en' },
  'SALON DE TE': { kind: 'cafe', cat: 'Gastronomy', dur: 60, label: 'Merendar en' },
  'CASA DE TE': { kind: 'cafe', cat: 'Gastronomy', dur: 60, label: 'Merendar en' },
};

// Registry rows that are not a place to eat/drink or visit: agencies, hotels,
// corporate or industrial entries.
const NOT_A_VENUE =
  /expedicion|turismo|agencia|hotel|hostel|hosteria|caba[ñn]a|apart|lodge|camping|verallia|ltda|cooperativa|grupo pe[ñn]aflor|patio de comidas/i;

const CHAINS =
  /mc\.?\s*donald|burger king|starbucks|subway|mostaza|grido|freddo|havanna|kfc|wendy|pizza hut|carrefour|walmart|disco|jumbo|\bd\.?k\.?\b|s\.?a\.?$/i;

// Intents with few candidates: always considered (still validated by Google).
const PRIORITY_VENUE = /brew|cervec|sushi|vermut|wine bar|nikkei|japon|pub\b/i;

function loadGastronomy(limitPerZone) {
  const rows = parse(
    fs.readFileSync(path.join(RAW, 'gastronomia.csv'), 'latin1'),
    ';',
  ).slice(1);
  const counts = {};
  for (const r of rows) {
    const rubro = fixEncoding(r[0] || '').toUpperCase().replace('CAF\u0090', 'CAFETERIA');
    const spec = GASTRO_KIND[rubro.replace('CAFÉ', 'CAFETERIA')];
    const dept = DEPARTMENTS[fixEncoding(r[5] || '').toUpperCase()];
    if (!spec || !dept || !ZONES.has(dept)) continue;
    const name = titleCase(fixEncoding(r[1] || ''));
    if (!name || name.length < 3 || CHAINS.test(name) || NOT_A_VENUE.test(name)) continue;
    const street = titleCase(fixEncoding(r[2] || ''));
    const number = fixEncoding(r[3] || '');
    if (!street || /^s\/?n$/i.test(number) && !street) continue;
    const klass = spec.cat === 'Nightlife' ? 'night' : spec.kind === 'cafe' ? 'cafe' : 'food';
    const quota = { food: limitPerZone, cafe: Math.ceil(limitPerZone / 4), night: Math.ceil((limitPerZone * 2) / 5) }[klass];
    const priority = PRIORITY_VENUE.test(name);
    const bucket = dept + '|' + klass;
    counts[bucket] = (counts[bucket] || 0) + 1;
    if (counts[bucket] > quota && !priority) continue;
    const slug = slugify(`${name}-${dept}`);
    if (places.has(slug)) continue;
    addPlace({
      slug,
      name,
      address: `${street}${number ? ` ${number}` : ''}`,
      department: dept,
      kind: spec.kind,
      sourceRef:
        'https://datosabiertos.mendoza.gov.ar/dataset/gastronomia-en-mendoza',
      description: `${titleCase(rubro.toLowerCase())} en ${regionOf(dept)}, incluido en el registro oficial de locales gastronómicos de la provincia de Mendoza.`,
    });
    addActivity({
      slug: `${spec.kind}-${slug}`.slice(0, 120),
      name: `${spec.label} ${name}`,
      description: `${spec.label} ${name}, ${titleCase(rubro.toLowerCase())} ubicado en ${street}${number ? ` ${number}` : ''}, ${regionOf(dept)}. Figura en el registro oficial de locales gastronómicos de Mendoza.`,
      durationMinutes: String(spec.dur),
      type: spec.kind === 'bar' ? 'Salida' : 'Comida',
      categories: spec.cat,
      places: slug,
    });
  }
}

// ------------------------------------------------------------ municipal
function loadPlazas() {
  const rows = parse(fs.readFileSync(path.join(RAW, 'plazas.csv'), 'utf8')).slice(1);
  for (const r of rows) {
    const name = (r[0] || '').trim();
    const lat = parseFloat(r[1]);
    const lon = parseFloat(r[2]);
    if (!name || Number.isNaN(lat)) continue;
    const slug = slugify(name);
    addPlace({
      slug,
      name,
      address: `${name}, Ciudad de Mendoza`,
      department: 'Ciudad de Mendoza',
      kind: 'park',
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
      sourceRef:
        'https://datos.ciudaddemendoza.gob.ar/dataset/plazas-mendoza',
      description: `Espacio verde público de la Ciudad de Mendoza.`,
    });
  }
}

// -------------------------------------------------------- adventure operators
// Provincial registry of adventure-tourism providers (CC-BY-4.0, Dec 2018).
// Only the trade name, scenario, activities, address and department are used:
// owner names, tax ids and phones are personal/commercial data and are not
// read. Each operator is re-validated against Google before it is published.
const ADVENTURE = [
  { re: /RAFT|RAFF/, key: 'rafting', label: 'Rafting', type: 'Rafting', dur: 180, cats: 'Sports;Outdoors' },
  { re: /CABALGAT/, key: 'cabalgata', label: 'Cabalgata', type: 'Cabalgata', dur: 120, cats: 'Outdoors' },
  { re: /TREK|SENDERISMO/, key: 'trekking', label: 'Trekking', type: 'Trekking', dur: 240, cats: 'Outdoors' },
  { re: /PARAPENT/, key: 'parapente', label: 'Parapente', type: 'Parapente', dur: 120, cats: 'Sports;Outdoors' },
  { re: /ESCALAD/, key: 'escalada', label: 'Escalada', type: 'Escalada', dur: 240, cats: 'Sports;Outdoors' },
  { re: /KAYAK|CANOT|CANOAS/, key: 'kayak', label: 'Kayak y canotaje', type: 'Kayak', dur: 120, cats: 'Sports;Outdoors' },
  { re: /MOUNTAIN|MONTAIN|MONTAIBIKE/, key: 'mountain-bike', label: 'Mountain bike', type: 'Mountain bike', dur: 180, cats: 'Sports;Outdoors' },
  { re: /4X4/, key: '4x4', label: 'Excursión 4x4', type: 'Excursión', dur: 300, cats: 'Outdoors;Short trips' },
];
function loadAdventure() {
  const file = path.join(RAW, 'aventura-2018.csv');
  if (!fs.existsSync(file)) return;
  const rows = parse(fs.readFileSync(file, 'latin1'), ';').slice(1);
  let kept = 0;
  for (const r of rows) {
    const fantasy = fixEncoding(r[1] || '');
    const dept = DEPARTMENTS[fixEncoding(r[9] || '').toUpperCase()];
    if (!fantasy || /^disponible$/i.test(fantasy) || !dept || !ZONES.has(dept)) continue;
    const scenario = titleCase(fixEncoding(r[2] || ''));
    const activityText = fixEncoding(r[3] || '').toUpperCase();
    const offered = ADVENTURE.filter((a) => a.re.test(activityText)).slice(0, 2);
    if (offered.length === 0) continue;
    const name = titleCase(fantasy);
    if (/^(la |el )?(rural|oasis|runakay)$/i.test(name) && false) continue;
    const street = titleCase(fixEncoding(r[4] || ''));
    const number = fixEncoding(r[5] || '');
    const locality = titleCase(fixEncoding(r[8] || ''));
    if (!street) continue;
    const slug = slugify(`${name}-${dept}`);
    if (places.has(slug)) continue;
    addPlace({
      slug,
      name,
      address: `${street}${number ? ` ${number}` : ''}${locality && locality !== dept ? `, ${locality}` : ''}`,
      department: dept,
      kind: 'adventure_operator',
      sourceRef: 'https://datosabiertos.mendoza.gov.ar/dataset/prestadores-de-turismo-aventura',
      description: `Operadora de turismo aventura con base en ${regionOf(dept)}${scenario ? `, que trabaja en ${scenario}` : ''}. Figura en el registro provincial de prestadores de turismo aventura.`,
    });
    for (const a of offered) {
      addActivity({
        slug: `${a.key}-${slug}`.slice(0, 120),
        name: `${a.label} con ${name}`,
        description: `${a.label} guiado por ${name}, operadora de turismo aventura de ${regionOf(dept)}${scenario ? ` (escenarios: ${scenario})` : ''}. Confirmá disponibilidad, equipamiento y precio directamente con la operadora.`,
        durationMinutes: String(a.dur),
        type: a.type,
        categories: a.cats,
        places: slug,
      });
    }
    kept += 1;
  }
  console.log('adventure operators kept=' + kept);
}

// ------------------------------------------------------------- EMETUR
const STOP = new Set(['de','del','la','las','el','los','y','e','bodega','bodegas','vinedos','vinedo','finca','restaurante','resto','restaurant','wines','wine','winery','familia','estate','cocina','bar','cafe']);
function toks(v) {
  // "R.J." is one token (rj), not two.
  const joined = v.replace(/\b([A-Za-z])\.(?=[A-Za-z]\b)/g, '$1');
  return slugify(joined).split('-').filter((t) => t && !STOP.has(t));
}
function similarity(a, b) {
  const l = toks(a), r = toks(b);
  if (!l.length || !r.length) return slugify(a) === slugify(b) ? 1 : 0;
  const rs = new Set(r);
  return l.filter((t) => rs.has(t)).length / Math.min(l.length, r.length);
}
function findPlace(name, dept, kinds) {
  let best = null, bestScore = 0;
  for (const p of places.values()) {
    if (kinds && !kinds.includes(p.kind)) continue;
    if (dept && p.department !== dept) continue;
    const sc = similarity(name, p.name);
    if (sc > bestScore) { best = p; bestScore = sc; }
  }
  return bestScore >= 0.75 ? best : null;
}

const EMETUR_STALE = '2026-02-15';
// Quarantined until EMETUR confirms reuse (see sources/quarantine/README.md).
const EMETUR_PRICES = process.env.INCLUDE_QUARANTINED_EMETUR === '1';
function loadEmeturBodegas() {
  const file = path.join(ROOT, 'sources', 'quarantine', 'emetur-mansa-bodega.json');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  let matched = 0, created = 0;
  for (const it of j.items) {
    if (!ZONES.has(it.dept)) continue;
    let place = findPlace(it.name, it.dept, ['winery']);
    if (place) matched += 1;
    else {
      const slug = slugify(it.name.startsWith('Bodega') || it.kind ? it.name : 'bodega ' + it.name) + '-' + slugify(it.dept);
      place = addPlace({
        slug: slug.slice(0, 120), name: it.name, department: it.dept,
        address: it.address || it.dept, kind: it.kind || 'winery',
        sourceRef: EMETUR_PRICES ? 'https://mendoza.tur.ar/mansa-bodega/' : '',
        description: `${it.kind === 'distillery' ? 'Destilería' : 'Bodega'} de ${regionOf(it.dept)} con visitas y degustaciones para el público.`,
      });
      created += 1;
    }
    const slug = ('visita-' + place.slug).slice(0, 120);
    const price = it.price !== undefined
      ? { kind: 'FROM', min: it.price }
      : { kind: 'RANGE', min: it.min, max: it.max };
    activities.delete(slug);
    addActivity({
      slug,
      name: place.kind === 'distillery' ? 'Visita y degustación en ' + place.name : 'Visita y degustación en ' + place.name.replace(/^Bodegas?s+/i, ''),
      description: EMETUR_PRICES
        ? it.experience + '. Precio de referencia tomado de la campaña oficial Mansa Bodega (vencida el 15 de febrero de 2026): confirmá el valor vigente con la bodega.'
        : 'Recorrido por la bodega y degustación de sus vinos en ' + regionOf(it.dept) + '. Confirmá horarios, reserva y precio directamente con la bodega.',
      durationMinutes: '90',
      type: 'Visita a bodega',
      categories: 'Gastronomy',
      places: place.slug,
      ...(EMETUR_PRICES
        ? {
            priceKind: price.kind, priceMin: price.min, priceMax: price.max ?? '',
            priceUnit: 'PER_PERSON', priceSource: 'CURATED',
            priceSourceRef: 'https://mendoza.tur.ar/mansa-bodega/',
            priceVerifiedAt: EMETUR_STALE,
          }
        : {}),
    });
  }
  console.log('emetur bodegas matched=' + matched + ' created=' + created);
}

function loadEmeturMenus() {
  const file = path.join(ROOT, 'sources', 'quarantine', 'emetur-manso-menu.json');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  let matched = 0, created = 0, dropped = 0;
  for (const it of j.items) {
    let dept = it.dept;
    let place = findPlace(it.name, dept, ['restaurant', 'bar', 'cafe', 'winery']);
    if (!dept && !place) { dropped += 1; continue; }
    if (!dept && place) dept = place.department;
    if (!ZONES.has(dept)) continue;
    if (place) matched += 1;
    else {
      const slug = slugify(it.name + '-' + dept);
      place = addPlace({
        slug, name: it.name, department: dept, address: dept,
        kind: 'restaurant', sourceRef: EMETUR_PRICES ? 'https://mendoza.tur.ar/manso-menu/' : '',
        description: 'Restaurante de ' + regionOf(dept) + ' abierto al público.',
      });
      created += 1;
    }
    const slug = ('menu-' + place.slug).slice(0, 120);
    const price = it.price !== undefined
      ? { kind: 'FROM', min: it.price }
      : { kind: 'RANGE', min: it.min, max: it.max };
    // The generated registry activity for this venue is replaced by the menu.
    for (const [k, a] of [...activities.entries()]) {
      if (a.places === place.slug && /^(restaurant|bar|cafe)-/.test(k)) activities.delete(k);
    }
    activities.delete(slug);
    addActivity({
      slug,
      name: (EMETUR_PRICES ? 'Menú completo en ' : 'Comer en ') + place.name,
      description: EMETUR_PRICES
        ? 'Menú en ' + place.name + ' (' + regionOf(dept) + '): ' + it.menu + '. Precio de referencia por persona tomado de la campaña oficial Manso Menú (vencida el 15 de febrero de 2026); confirmá el valor vigente con el restaurante.'
        : 'Comer en ' + place.name + ', restaurante de ' + regionOf(dept) + '. Confirmá la carta, los horarios y los precios directamente con el restaurante.',
      durationMinutes: '90',
      type: 'Comida',
      categories: 'Gastronomy',
      places: place.slug,
      ...(EMETUR_PRICES
        ? {
            priceKind: price.kind, priceMin: price.min, priceMax: price.max ?? '',
            priceUnit: 'PER_PERSON', priceSource: 'CURATED',
            priceSourceRef: 'https://mendoza.tur.ar/manso-menu/',
            priceVerifiedAt: EMETUR_STALE,
          }
        : {}),
    });
  }
  console.log('emetur menus matched=' + matched + ' created=' + created + ' dropped(no department)=' + dropped);
}

// ------------------------------------------------------------- curated
function loadCurated() {
  const dir = path.join(ROOT, 'curated');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => /^[0-9]{2}-.*[.]json$/.test(f)).sort()) {
    const items = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const item of items) {
      const placeSlug = item.place.slug || slugify(item.place.name);
      const existing = places.get(placeSlug);
      if (existing) {
        Object.assign(existing, Object.fromEntries(
          Object.entries(item.place).filter(([, v]) => v !== undefined && v !== ''),
        ));
        existing.slug = placeSlug;
      } else {
        addPlace({ ...item.place, slug: placeSlug });
      }
      for (const act of item.activities || []) {
        const slug = act.slug || slugify(act.name);
        // curated activities replace generated ones with the same slug
        activities.delete(slug);
        for (const [key, a] of [...activities.entries()]) {
          if (act.replaces && act.replaces.includes(key)) activities.delete(key);
        }
        const price = act.price || {};
        addActivity({
          slug,
          name: act.name,
          description: act.description,
          durationMinutes: String(act.durationMinutes),
          type: act.type || '',
          categories: [].concat(act.categories).join(';'),
          places: [].concat(act.places || placeSlug).join(';'),
          priceKind: price.kind || '',
          priceMin: price.min ?? '',
          priceMax: price.max ?? '',
          priceUnit: price.unit || '',
          priceSource: price.source || '',
          priceSourceRef: price.sourceRef || '',
          priceVerifiedAt: price.verifiedAt || '',
          verifiedAt: act.verifiedAt || TODAY,
        });
      }
    }
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

const limit = Number(process.env.GASTRO_PER_ZONE || 20);
loadBodegas();
loadGastronomy(limit);
loadPlazas();
loadAdventure();
loadEmeturBodegas();
loadEmeturMenus();

// The gastronomy registry also lists restaurants that belong to a winery that
// is already in the catalog as a winery: that is the same Place, not a second
// one (the importer would flag it as a duplicate).
for (const place of [...places.values()]) {
  if (!['restaurant', 'bar', 'cafe'].includes(place.kind)) continue;
  if (!place.sourceRef.includes('gastronomia-en-mendoza')) continue;
  const winery = findPlace(place.name, place.department, ['winery']);
  if (!winery) continue;
  places.delete(place.slug);
  for (const [key, a] of [...activities.entries()]) {
    if (a.places.split(';').includes(place.slug)) activities.delete(key);
  }
}
loadCurated();

// Reviewed Google decisions: Place IDs are the only provider value kept, and
// places that Google shows closed/unverifiable are dropped, so the catalog can
// be rebuilt without calling Google again.
const idsFile = path.join(ROOT, 'curated', 'google-place-ids.json');
if (fs.existsSync(idsFile)) {
  const ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
  for (const [slug, id] of Object.entries(ids)) {
    const place = places.get(slug);
    if (place) place.googlePlaceId = id;
  }
}
const droppedFile = path.join(ROOT, 'curated', 'dropped-places.json');
if (fs.existsSync(droppedFile)) {
  const dropped = JSON.parse(fs.readFileSync(droppedFile, 'utf8'));
  for (const slug of Object.keys(dropped)) {
    places.delete(slug);
    for (const [key, a] of [...activities.entries()]) {
      if (a.places.split(';').includes(slug)) activities.delete(key);
    }
  }
}

// Drop activities whose place is missing and places nobody references only
// when they are generated registry stubs (plazas stay as Places).
for (const [slug, a] of [...activities.entries()]) {
  const refs = a.places.split(';');
  if (refs.some((r) => !places.has(r))) {
    console.warn(`activity ${slug} references an unknown place; dropped`);
    activities.delete(slug);
  }
}

writeCsv(
  path.join(OUT, 'places.csv'),
  ['slug', 'name', 'description', 'address', 'country', 'city', 'department',
    'latitude', 'longitude', 'kind', 'googlePlaceId', 'verifiedAt', 'sourceRef'],
  [...places.values()],
);
writeCsv(
  path.join(OUT, 'activities.csv'),
  ['slug', 'name', 'description', 'durationMinutes', 'type', 'categories', 'places',
    'priceKind', 'priceMin', 'priceMax', 'priceUnit', 'priceSource', 'priceSourceRef',
    'priceVerifiedAt', 'verifiedAt'],
  [...activities.values()],
);
console.log(`places=${places.size} activities=${activities.size}`);
