/**
 * Inspect registry-linked business websites for their own published JSON-LD
 * coordinates. Google candidates only corroborate identity; no coordinate
 * from a Google response is saved. Output is a review file, never a package.
 * Run explicitly; builds remain offline and deterministic.
 */
const fs = require('fs');
const path = require('path');
const parse = require('./parse-csv.cjs');
const { streetKey } = require('./normalize-address.cjs');
const ROOT = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/package.json'), 'utf8'));
const matches = JSON.parse(fs.readFileSync(path.join(ROOT, '.local/matches.json'), 'utf8'));
const outFile = path.join(ROOT, '.local/official-coordinate-review.json');
const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const mailHosts = /(?:^|\.)(?:gmail|googlemail|hotmail|outlook|live|yahoo|yahooar|icloud|aol|msn|speedy|arnet)\./;
const fold = (s) => streetKey(s).replace(/\b(?:bodega|bodegas|finca|restaurante|restaurant|resto)\b/g, '').replace(/\s+/g, ' ').trim();
const candidates = new Map();
for (const [file, nameColumn, contactColumn] of [['enoturismo.csv', 0, 7], ['gastronomia.csv', 1, 9]]) {
  for (const row of parse(fs.readFileSync(path.join(ROOT, 'raw', file), 'latin1'), ';').slice(1)) {
    const name = fold(row[nameColumn] || '');
    if (!name) continue;
    const place = pkg.places.find((p) => fold(p.name) === name);
    if (!place || place.latitude !== null) continue;
    const contact = row[contactColumn] || '';
    const domain = contact.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)?.[1] || contact.match(/(?:https?:\/\/|www\.)([a-z0-9.-]+\.[a-z]{2,})/i)?.[1];
    if (domain && !mailHosts.test(domain.toLowerCase())) candidates.set(place.slug, { place, url: `https://${domain.toLowerCase()}/` });
  }
}

function distance(a, b) {
  const rad = Math.PI / 180;
  const dlat = (a.latitude - b.latitude) * rad;
  const dlon = (a.longitude - b.longitude) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

async function inspect({ place, url }) {
  if (place.slug in results) return;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'SmartPlan-catalog/1.0 (UTN final project; public coordinate research)' } });
    if (!response.ok) { results[place.slug] = { status: `http_${response.status}`, sourceUrl: url }; return; }
    const html = await response.text();
    const nodes = [];
    for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([^]*?)<\/script>/gi)) {
      try {
        const body = JSON.parse(match[1]);
        nodes.push(...(Array.isArray(body) ? body : body['@graph'] || [body]));
      } catch { /* Invalid publisher metadata is not evidence. */ }
    }
    const points = nodes.flatMap((node) => {
      const latitude = Number(node.geo?.latitude);
      const longitude = Number(node.geo?.longitude);
      return node.geo && latitude >= -35.5 && latitude <= -32 && longitude >= -70.6 && longitude <= -67
        ? [{ latitude, longitude, address: node.address, name: node.name }] : [];
    });
    const unique = [...new Map(points.map((p) => [`${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`, p])).values()];
    if (unique.length !== 1) { results[place.slug] = { status: unique.length ? 'multiple_locations' : 'no_coordinates', sourceUrl: response.url }; return; }
    const point = unique[0];
    const candidate = matches[place.slug]?.candidates?.find((c) => c.placeId === place.googlePlaceId);
    const identityDistance = candidate ? distance(point, candidate) : null;
    const named = nodes.some((node) => node.name && fold(node.name).includes(fold(place.name)));
    results[place.slug] = {
      status: named && identityDistance !== null && identityDistance <= 300 ? 'corroborated' : 'needs_review',
      sourceUrl: response.url,
      latitude: point.latitude,
      longitude: point.longitude,
      address: point.address || null,
      identityDistanceMeters: identityDistance === null ? null : Math.round(identityDistance),
      verifiedAt: '2026-10-13',
    };
  } catch { results[place.slug] = { status: 'unavailable', sourceUrl: url }; }
}

(async () => {
  const queue = [...candidates.values()];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      await inspect(queue.shift());
      fs.writeFileSync(outFile, JSON.stringify(Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
    }
  }));
  console.log(JSON.stringify({ researched: Object.keys(results).length, corroborated: Object.values(results).filter((r) => r.status === 'corroborated').length, reviewFile: outFile }));
})();
