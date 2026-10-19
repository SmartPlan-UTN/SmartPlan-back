/**
 * Where a venue's official URL might be. Every result is a HINT: it becomes
 * a CANDIDATE `place_source` and only speaks for the venue after the fetched
 * page passes the identity check.
 *
 * Inputs (all offline files or our own DB):
 * - catalog refs: curated official pages already reviewed for a price;
 * - registry contact columns (Mendoza open data, CC BY);
 * - OSM `website` tags (ODbL, discovery hint only: never persisted as fact);
 * - Google `websiteUri` captured earlier for identity review (hint only).
 */
import { normalizeText } from './extract/hours-text';
import { domainPolicy } from './fetch/domain-policy';
import { nameTokens } from './identity';
import type { SourceDiscovery } from './entities/place-source.entity';

export interface CatalogPlace {
  id: number;
  slug: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  departmentName: string | null;
}

export interface SourceHint {
  placeId: number;
  url: string;
  via: SourceDiscovery;
  /** Why we matched this hint to that place. */
  match: string;
}

/** A chain's navigation must not move a branch's evidence to another region. */
export function sameLocationScope(reference: string, target: string): boolean {
  const source = new URL(reference);
  const next = new URL(target);
  if (
    source.hostname.replace(/^www\./, '') !==
    next.hostname.replace(/^www\./, '')
  )
    return true;
  const locationKeys = new Set([
    'provincia',
    'province',
    'region',
    'branch',
    'sucursal',
    'store',
    'location',
    'local',
    'restaurant',
  ]);
  for (const [key, value] of source.searchParams) {
    if (!locationKeys.has(key.toLowerCase())) continue;
    const selected = next.searchParams.get(key);
    if (selected !== null && selected !== value) return false;
  }
  return true;
}

/** Reviewed official URLs are discovery hints; acquisition still proves identity. */
export function reviewedSourceHints(
  places: CatalogPlace[],
  input: unknown,
): SourceHint[] {
  if (!Array.isArray(input)) throw new Error('Source hints must be an array.');
  const bySlug = new Map(places.map((place) => [place.slug, place]));
  return input.map((value: unknown) => {
    if (!value || typeof value !== 'object')
      throw new Error('Invalid source hint.');
    const row = value as { slug?: unknown; url?: unknown };
    const place =
      typeof row.slug === 'string' ? bySlug.get(row.slug) : undefined;
    const url = typeof row.url === 'string' ? usableSourceUrl(row.url) : null;
    if (!place || !url)
      throw new Error('Source hint needs a known place and a permitted URL.');
    return {
      placeId: place.id,
      url,
      via: 'CURATOR',
      match: 'reviewed official website hint',
    };
  });
}

const NEWS_OR_GOVERNMENT =
  /(sitioandino|elsol|losandes|mdzol|unidiversidad|infobae|clarin|lanacion|prensa\.|\.gob\.ar|\.gov\.ar|datosabiertos|wikipedia|wikidata|uncuyo\.edu\.ar)/i;

/** A URL worth trying as a venue's own source (not news, social, marketplace). */
export function usableSourceUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (NEWS_OR_GOVERNMENT.test(url.hostname)) return null;
  if (domainPolicy(url.hostname).decision === 'deny') return null;
  url.hash = '';
  return url.toString();
}

export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = new Set(nameTokens(b));
  if (!ta.length || !tb.size) return false;
  const shared = ta.filter((token) => tb.has(token)).length;
  return shared >= Math.max(1, Math.ceil(Math.min(ta.length, tb.size) * 0.67));
}

function meters(
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

export interface OsmHint {
  name: string;
  latitude: number;
  longitude: number;
  website: string | null;
  kind: string;
  tags: Record<string, string>;
}

/** OSM elements (Overpass JSON) as hints. */
export function osmHints(overpass: { elements: unknown[] }): OsmHint[] {
  const hints: OsmHint[] = [];
  for (const raw of overpass.elements) {
    const element = raw as {
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    };
    const tags = element.tags ?? {};
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (!tags.name || latitude === undefined || longitude === undefined)
      continue;
    hints.push({
      name: tags.name,
      latitude,
      longitude,
      website: tags.website ?? tags['contact:website'] ?? null,
      kind: tags.amenity ?? tags.craft ?? tags.tourism ?? 'unknown',
      tags,
    });
  }
  return hints;
}

/** Matches OSM hints with a website to catalog places (name + ≤250 m). */
export function osmSourceHints(
  places: CatalogPlace[],
  hints: OsmHint[],
): SourceHint[] {
  const result: SourceHint[] = [];
  for (const hint of hints) {
    if (!hint.website) continue;
    const url = usableSourceUrl(hint.website);
    if (!url) continue;
    const match = places.find(
      (place) =>
        namesMatch(place.name, hint.name) &&
        place.latitude !== null &&
        place.longitude !== null &&
        meters(
          { latitude: place.latitude, longitude: place.longitude },
          hint,
        ) <= 250,
    );
    if (match)
      result.push({
        placeId: match.id,
        url,
        via: 'OSM_HINT',
        match: `osm name+250m (${hint.name})`,
      });
  }
  return result;
}

/** Registry rows (name, department, contact) → hints for same-named places. */
export function registrySourceHints(
  places: CatalogPlace[],
  rows: { name: string; department: string; contact: string }[],
): SourceHint[] {
  const mailHosts =
    /(?:^|\.)(?:gmail|googlemail|hotmail|outlook|live|yahoo|yahooar|icloud|aol|msn|speedy|arnet)\./;
  const result: SourceHint[] = [];
  for (const row of rows) {
    const domain =
      /(?:https?:\/\/|www\.)([a-z0-9.-]+\.[a-z]{2,})/i.exec(row.contact)?.[1] ??
      /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(row.contact)?.[1];
    if (!domain || mailHosts.test(domain.toLowerCase())) continue;
    const url = usableSourceUrl(`https://${domain.toLowerCase()}/`);
    if (!url) continue;
    const department = normalizeText(row.department);
    const match = places.find(
      (place) =>
        namesMatch(place.name, row.name) &&
        (!place.departmentName ||
          normalizeText(place.departmentName).includes(
            department.replace('capital', 'ciudad'),
          ) ||
          department === 'capital'),
    );
    if (match)
      result.push({
        placeId: match.id,
        url,
        via: 'REGISTRY',
        match: `registry ${row.name}`,
      });
  }
  return result;
}

/** Wikidata items (CC0) with an official website (P856), matched by name + 300 m. */
export function wikidataSourceHints(
  places: CatalogPlace[],
  rows: { label: string; latitude: number; longitude: number; site: string }[],
): SourceHint[] {
  const result: SourceHint[] = [];
  for (const row of rows) {
    const url = row.site ? usableSourceUrl(row.site) : null;
    if (!url) continue;
    const match = places.find(
      (place) =>
        namesMatch(place.name, row.label) &&
        place.latitude !== null &&
        place.longitude !== null &&
        meters({ latitude: place.latitude, longitude: place.longitude }, row) <=
          300,
    );
    if (match)
      result.push({
        placeId: match.id,
        url,
        via: 'WIKIDATA',
        match: `wikidata ${row.label}`,
      });
  }
  return result;
}

/**
 * Domains a venue would plausibly own, from its name ("La Marchigiana" →
 * lamarchigiana.com.ar, marchigiana.com.ar…). Only a guess: the caller
 * checks DNS, and the page must still pass the identity check.
 */
export function guessDomains(name: string, kind: string | null): string[] {
  const words = normalizeText(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = nameTokens(name);
  if (!meaningful.length) return [];
  const bases = new Set<string>([words.join(''), meaningful.join('')]);
  if (kind === 'winery') bases.add(`bodega${meaningful.join('')}`);
  if (kind === 'restaurant') bases.add(`${meaningful.join('')}resto`);
  const domains: string[] = [];
  for (const base of bases) {
    // A one-word generic base ("capri", "roma") collides with unrelated sites.
    if (base.length < 6 || base.length > 30) continue;
    domains.push(`${base}.com.ar`, `${base}.com`);
  }
  return [...new Set(domains)].slice(0, 6);
}
