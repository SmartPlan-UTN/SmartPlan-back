/**
 * Network lookups the builder needs, cached in versioned files so a build
 * is reproducible offline:
 *
 * - Georef (Gobierno de Argentina, CC-BY 4.0): street-address geocoding and
 *   reverse lookup of the department of a coordinate.
 *   https://datosgobar.github.io/georef-ar-api/  ->  curated/georef-cache.json
 * - Wikimedia Commons: licence, author and a thumbnail URL for open-licensed
 *   photos (Wikidata P18 or curated file names)  ->  curated/commons-cache.json
 *
 * Only facts (coordinates, departments, licence metadata) are kept. Both are
 * attributed in SOURCES.md. Never used for Google content.
 */
const fs = require('fs');
const path = require('path');
const { addressCandidates, sameStreet } = require('./normalize-address.cjs');

const ROOT = __dirname;
const GEOREF_FILE = path.join(ROOT, 'curated', 'georef-cache.json');
const COMMONS_FILE = path.join(ROOT, 'curated', 'commons-cache.json');
const UA = 'SmartPlan-catalog/1.0 (UTN FRM final project; catalog research)';

function load(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}
function save(file, data) {
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
}

const georef = load(GEOREF_FILE);
const commons = load(COMMONS_FILE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Georef department names -> catalog department names. */
const GEOREF_DEPARTMENTS = {
  Capital: 'Ciudad de Mendoza',
  'Godoy Cruz': 'Godoy Cruz',
  'Guaymallén': 'Guaymallén',
  'Maipú': 'Maipú',
  'Luján de Cuyo': 'Luján de Cuyo',
  'Las Heras': 'Las Heras',
  Tupungato: 'Tupungato',
  'Tunuyán': 'Tunuyán',
  'San Carlos': 'San Carlos',
  'San Rafael': 'San Rafael',
  'San Martín': 'San Martín',
  'Junín': 'Junín',
  Rivadavia: 'Rivadavia',
  Lavalle: 'Lavalle',
  'Malargüe': 'Malargüe',
  'General Alvear': 'General Alvear',
  'Santa Rosa': 'Santa Rosa',
  'La Paz': 'La Paz',
};
const CATALOG_TO_GEOREF = Object.fromEntries(
  Object.entries(GEOREF_DEPARTMENTS).map(([g, c]) => [c, g]),
);

async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (response.status === 429 || response.status >= 500) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

/** Street + number geocode within a department (null when unknown). */
async function geocode(street, number, department, { fetchMissing }) {
  const candidates = addressCandidates(street, number);
  if (!candidates.length) return null;
  const dept = CATALOG_TO_GEOREF[department];
  if (!dept) return null;
  const key = `geo-v3|${candidates[0].toLowerCase()}|${dept}`;
  if (key in georef) return georef[key];
  // Keep the prior cache usable offline; new network results require an
  // unambiguous exact street/height match instead of taking the first hit.
  if (!fetchMissing) return georef[`geo-v2|${candidates[0].toLowerCase()}|${dept}`] || null;
  for (const candidate of candidates) {
  const url = new URL('https://apis.datos.gob.ar/georef/api/direcciones');
  url.searchParams.set('direccion', candidate);
  url.searchParams.set('departamento', dept);
  url.searchParams.set('provincia', 'Mendoza');
  url.searchParams.set('max', '5');
  const body = await fetchJson(url);
  await sleep(120);
  if (!body || !Array.isArray(body.direcciones)) return null;
  const requestedStreets = street.split(/\s+(?:y|esquina)\s+/i);
  const hits = body.direcciones.filter((hit) =>
    hit.provincia?.nombre === 'Mendoza' && hit.departamento?.nombre === dept &&
    sameStreet(requestedStreets[0], hit.calle?.nombre) &&
    (requestedStreets.length === 1 || sameStreet(requestedStreets[1], hit.calle_cruce_1?.nombre)) &&
    (!/^\d+$/.test(String(number)) || hit.altura?.valor === Number(number)) &&
    Number.isFinite(hit.ubicacion?.lat) && Number.isFinite(hit.ubicacion?.lon));
  const hit = body.total === 1 && hits.length === 1 ? hits[0] : null;
  const value =
    hit && hit.ubicacion && hit.ubicacion.lat != null
      ? {
          lat: Number(hit.ubicacion.lat.toFixed(6)),
          lon: Number(hit.ubicacion.lon.toFixed(6)),
          normalized: hit.nomenclatura,
        }
      : null;
  if (value) { georef[key] = value; persist(); return value; }
  }
  georef[key] = null;
  persist();
  return null;
}

/** Catalog department of a coordinate (null outside Mendoza / unknown). */
async function departmentAt(lat, lon, { fetchMissing }) {
  const key = `rev|${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (key in georef) return georef[key];
  if (!fetchMissing) return null;
  const url = new URL('https://apis.datos.gob.ar/georef/api/ubicacion');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  const body = await fetchJson(url);
  await sleep(120);
  const u = body && body.ubicacion;
  const value =
    u && u.provincia && u.provincia.nombre === 'Mendoza' && u.departamento
      ? GEOREF_DEPARTMENTS[u.departamento.nombre] || u.departamento.nombre
      : null;
  if (body) georef[key] = value;
  return value;
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Licence metadata of a Commons file ("File:Name.jpg" or a Special:FilePath
 * URL). Returns null when the file is not under a free licence we accept.
 */
async function commonsImage(fileRef, { fetchMissing }) {
  const title = decodeURIComponent(
    String(fileRef)
      .replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//, '')
      .replace(/^File:/, ''),
  ).replace(/_/g, ' ');
  const key = `File:${title}`;
  if (key in commons && (commons[key] || !fetchMissing)) return commons[key];
  if (!fetchMissing) return null;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', key);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('iiurlwidth', '960');
  url.searchParams.set('format', 'json');
  const body = await fetchJson(url);
  await sleep(150);
  const page = body && body.query && Object.values(body.query.pages || {})[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  let value = null;
  if (info) {
    const meta = info.extmetadata || {};
    const license = stripTags(meta.LicenseShortName && meta.LicenseShortName.value);
    const free = /^(?:cc[ -]by(?:[ -]sa)? [1-4]\.0|cc0(?: 1\.0)?|public domain|dominio p[úu]blico)$/i.test(license);
    if (free && info.thumburl && /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(info.thumburl)) {
      const thumbnail = new URL(info.thumburl);
      thumbnail.search = '';
      value = {
        url: thumbnail.toString(),
        license: license.slice(0, 80),
        author: stripTags(meta.Artist && meta.Artist.value).slice(0, 200) || null,
        sourceUrl: info.descriptionurl,
      };
    }
  }
  if (body) commons[key] = value;
  return value;
}

function persist() {
  save(GEOREF_FILE, georef);
  save(COMMONS_FILE, commons);
}

module.exports = { geocode, departmentAt, commonsImage, persist };
