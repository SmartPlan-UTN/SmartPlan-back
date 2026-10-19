/**
 * pnpm discovery <command> [--confirm <exact_local_database>]
 *
 *   osm-import  --file <overpass.json>   ODbL layer → linked/created Places
 *   link-google [--limit N]              OSM-identity Places ↔ Google Place IDs (IDs only, free)
 *   matrix      [--zones a,b] [--pages N] zones × categories × intents, IDs only (free)
 *   resolve-ids [--limit N] [--ids a,b]   discovered IDs → official site → Place (capped, free share)
 *   canaries    [--out file.json]        obvious-Mendoza regression suite
 *   report      [--out file.md]          universe by zone × kind, discovery index state
 *
 * Writes require --confirm with the exact LOCAL database name. The only
 * Google SKU used here is Text Search Essentials (IDs Only): unlimited and
 * free. No Google content (names, positions, hours) is requested or stored.
 */
import 'reflect-metadata';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { assessDatabaseTarget } from '../config/database-target';
import {
  canonicalKey,
  distanceMeters,
  nameSimilarity,
  normalizeName,
} from '../catalog/catalog-dedupe';
import { GoogleMapsClientService } from '../external-integration/google-maps/google-maps-client.service';
import { osmVenue, type OsmVenue, type OverpassElement } from './osm-mapping';
import { ExternalDataUsageService } from '../external-integration/external-data-usage.service';
import { ExternalDataUsage } from '../external-integration/entities/external-data-usage.entity';
import { ExternalProvider } from '../external-integration/entities/external-provider.entity';
import {
  GOOGLE_SKU_BY_CONTEXT,
  startOfBudgetMonth,
  trustedFreeRequests,
  type GoogleUsageContext,
} from '../external-integration/google-cost';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { promote } from '../knowledge/promote-command';
import {
  CANARIES,
  DISCOVERY_CATEGORIES,
  DISCOVERY_ZONES,
  type DiscoveryZone,
} from './discovery-matrix';

const LOCAL = join(__dirname, '../../catalog-data/mendoza-v1/.local/odbl');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function open(write: boolean): Promise<DataSource> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: dataSource } = require('../database/data-source') as {
    default: DataSource;
  };
  const options = dataSource.options as {
    url?: string;
    host?: string;
    database?: string;
  };
  const target = assessDatabaseTarget({
    url: options.url,
    host: options.host,
    database: options.database,
    deployed: false,
  });
  if (!target.isLocal)
    throw new Error('Discovery commands run on a local database only.');
  if (write && option('--confirm') !== target.database)
    throw new Error(
      `Writing requires --confirm ${target.database ?? '<local database>'}.`,
    );
  Object.assign(dataSource.options, {
    synchronize: false,
    migrationsRun: false,
    extra: { connectionTimeoutMillis: 5000, statement_timeout: 60000 },
  });
  await dataSource.initialize();
  return dataSource;
}

function google(): GoogleMapsClientService {
  const values: Record<string, unknown> = {
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY ?? '',
    GOOGLE_PLACES_ENABLED: process.env.GOOGLE_PLACES_ENABLED ?? 'true',
    GOOGLE_MAX_REQUESTS_PER_SECOND:
      process.env.GOOGLE_MAX_REQUESTS_PER_SECOND ?? '8',
  };
  return new GoogleMapsClientService(new ConfigService(values) as never);
}

const GEOREF_TO_CATALOG: Record<string, string> = {
  Capital: 'Ciudad de Mendoza',
};

/** Department name per point (Georef bulk reverse lookup, CC BY 4.0, cached). */
async function departments(
  points: { key: string; latitude: number; longitude: number }[],
): Promise<Map<string, string | null>> {
  const cacheFile = join(LOCAL, 'georef-departments.json');
  const cache: Record<string, string | null> = existsSync(cacheFile)
    ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<
        string,
        string | null
      >)
    : {};
  const pending = points.filter((point) => !(point.key in cache));
  for (let index = 0; index < pending.length; index += 500) {
    const batch = pending.slice(index, index + 500);
    const response = await fetch(
      'https://apis.datos.gob.ar/georef/api/ubicacion',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ubicaciones: batch.map((point) => ({
            lat: point.latitude,
            lon: point.longitude,
            aplanar: true,
            campos: 'departamento.nombre,provincia.nombre',
          })),
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok) throw new Error(`Georef ${response.status}`);
    const body = (await response.json()) as {
      resultados: {
        ubicacion?: {
          departamento_nombre?: string | null;
          provincia_nombre?: string | null;
        };
      }[];
    };
    body.resultados.forEach((result, position) => {
      const location = result.ubicacion;
      const name =
        location?.provincia_nombre === 'Mendoza' && location.departamento_nombre
          ? (GEOREF_TO_CATALOG[location.departamento_nombre] ??
            location.departamento_nombre)
          : null;
      cache[batch[position].key] = name;
    });
    writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return new Map(points.map((point) => [point.key, cache[point.key] ?? null]));
}

function slugify(text: string): string {
  return normalizeName(text).replace(/\s+/g, '-').slice(0, 80) || 'lugar';
}

function addressOf(tags: Record<string, string>): string {
  const street = tags['addr:street'];
  const number = tags['addr:housenumber'];
  const city = tags['addr:city'];
  return [street ? `${street}${number ? ` ${number}` : ''}` : null, city]
    .filter(Boolean)
    .join(', ')
    .slice(0, 255);
}

/** A richer, more recently edited element wins inside a duplicate cluster. */
function weight(venue: OsmVenue): number {
  return (
    Object.keys(venue.tags).length +
    (venue.timestamp ? Date.parse(venue.timestamp) / 1e11 : 0)
  );
}

async function osmImport(dataSource: DataSource): Promise<void> {
  const file = option('--file');
  if (!file || !existsSync(file)) throw new Error('--file <overpass.json>');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    elements: OverpassElement[];
    osm3s?: { timestamp_osm_base?: string };
  };
  const snapshotAt = raw.osm3s?.timestamp_osm_base ?? new Date().toISOString();
  const venues = raw.elements
    .map(osmVenue)
    .filter((venue): venue is OsmVenue => venue !== null)
    // Neighbourhood parks without any notability are connective tissue
    // only; the planner does not need hundreds of them.
    .filter(
      (venue) =>
        venue.kind !== 'park' ||
        Boolean(venue.tags.wikidata || venue.tags.tourism),
    );

  // 1. Same physical venue inside OSM (a node and a building, two nodes).
  const clusters: OsmVenue[][] = [];
  for (const venue of [...venues].sort((a, b) => weight(b) - weight(a))) {
    const cluster = clusters.find(
      ([head]) =>
        distanceMeters(head, venue) <= 150 &&
        nameSimilarity(head.name, venue.name) >= 0.8,
    );
    if (cluster) cluster.push(venue);
    else clusters.push([venue]);
  }

  // 2. Departments (Georef, bulk).
  const departmentOf = await departments(
    clusters.map(([head]) => ({
      key: `${head.latitude},${head.longitude}`,
      latitude: head.latitude,
      longitude: head.longitude,
    })),
  );
  const departmentRows = await dataSource.query<
    { id: number; name: string; id_city: number }[]
  >('SELECT id, name, id_city FROM department WHERE deleted_at IS NULL');
  const departmentId = new Map(
    departmentRows.map((row) => [row.name, Number(row.id)]),
  );
  const city = departmentRows[0]?.id_city;
  // Mendoza's remaining departments are real geography, not venue data.
  for (const name of new Set(departmentOf.values())) {
    if (!name || departmentId.has(name) || city === undefined) continue;
    const [row] = await dataSource.query<{ id: number }[]>(
      'INSERT INTO department (id_city, name) VALUES ($1, $2) RETURNING id',
      [city, name],
    );
    departmentId.set(name, Number(row.id));
    console.log(`department added: ${name}`);
  }

  // 3. Existing Places: link the same physical venue, never duplicate it.
  const existing = await dataSource.query<
    {
      id: number;
      name: string;
      latitude: string | null;
      longitude: string | null;
      id_department: number;
    }[]
  >(
    'SELECT id, name, latitude, longitude, id_department FROM place WHERE deleted_at IS NULL',
  );
  const already = new Set(
    (
      await dataSource.query<{ osm_type: string; osm_id: string }[]>(
        'SELECT osm_type, osm_id FROM odbl_feature WHERE deleted_at IS NULL',
      )
    ).map((row) => `${row.osm_type}/${row.osm_id}`),
  );

  const counts = { created: 0, linked: 0, duplicate: 0, skipped: 0 };
  const claimed = new Set<number>();
  for (const cluster of clusters) {
    const [head] = cluster;
    if (
      cluster.every((venue) => already.has(`${venue.osmType}/${venue.osmId}`))
    )
      continue;
    const departmentName =
      departmentOf.get(`${head.latitude},${head.longitude}`) ?? null;
    const idDepartment = departmentName
      ? departmentId.get(departmentName)
      : undefined;
    let idPlace: number | null = null;
    let status: 'CREATED' | 'LINKED' | 'SKIPPED' = 'SKIPPED';
    let note: string | null = null;
    if (idDepartment === undefined) {
      note = 'outside Mendoza departments';
    } else {
      const match = existing.find((place) => {
        if (claimed.has(place.id)) return false;
        if (nameSimilarity(place.name, head.name) < 0.8) return false;
        if (place.latitude !== null && place.longitude !== null)
          return (
            distanceMeters(
              {
                latitude: Number(place.latitude),
                longitude: Number(place.longitude),
              },
              head,
            ) <= 150
          );
        return Number(place.id_department) === idDepartment;
      });
      if (match) {
        idPlace = match.id;
        status = 'LINKED';
        claimed.add(match.id);
        // An unlocated Place gains the ODbL position (provenance recorded).
        if (match.latitude === null)
          await dataSource.query(
            `UPDATE place SET latitude = $2, longitude = $3, coordinates_ref = $4, updated_at = now()
              WHERE id = $1 AND latitude IS NULL`,
            [
              match.id,
              head.latitude,
              head.longitude,
              `osm:${head.osmType}/${head.osmId}`,
            ],
          );
      } else {
        const [row] = await dataSource.query<{ id: number }[]>(
          `INSERT INTO place (name, address, id_department, latitude, longitude, slug, status, kind,
              canonical_key, discoverable, identity_source, coordinates_ref)
           VALUES ($1, $2, $3, $4, $5, $6, 'published', $7, $8, true, 'OSM_ODBL', $9)
           RETURNING id`,
          [
            head.name.slice(0, 150),
            addressOf(head.tags),
            idDepartment,
            head.latitude,
            head.longitude,
            `${slugify(head.name)}-osm${head.osmType[0]}${head.osmId}`.slice(
              0,
              120,
            ),
            head.kind,
            canonicalKey(head.name, head.latitude, head.longitude),
            `osm:${head.osmType}/${head.osmId}`,
          ],
        );
        idPlace = Number(row.id);
        status = 'CREATED';
      }
    }
    counts[status.toLowerCase() as 'created' | 'linked' | 'skipped'] += 1;
    for (const [position, venue] of cluster.entries()) {
      if (already.has(`${venue.osmType}/${venue.osmId}`)) continue;
      const duplicate = position > 0;
      if (duplicate) counts.duplicate += 1;
      await dataSource.query(
        `INSERT INTO odbl_feature (osm_type, osm_id, osm_version, osm_timestamp, name, latitude, longitude,
            tags, snapshot_at, id_place, match_status, match_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          venue.osmType,
          venue.osmId,
          venue.version,
          venue.timestamp,
          venue.name.slice(0, 200),
          venue.latitude,
          venue.longitude,
          JSON.stringify(venue.tags),
          snapshotAt,
          idPlace,
          duplicate ? 'DUPLICATE' : status,
          duplicate ? `same venue as ${head.osmType}/${head.osmId}` : note,
        ],
      );
    }
  }
  console.log(
    JSON.stringify({
      elements: raw.elements.length,
      venues: venues.length,
      clusters: clusters.length,
      ...counts,
    }),
  );
}

/** Upsert discovered IDs with the SmartPlan cell that found them. */
async function recordIds(
  dataSource: DataSource,
  ids: string[],
  cell: string,
): Promise<void> {
  if (!ids.length) return;
  await dataSource.query(
    `INSERT INTO google_place_discovery (google_place_id, first_seen_at, last_seen_at, hits, cells)
     SELECT id, now(), now(), 1, ARRAY[$2::text] FROM unnest($1::text[]) AS id
     ON CONFLICT (google_place_id) WHERE deleted_at IS NULL DO UPDATE
       SET last_seen_at = now(),
           hits = google_place_discovery.hits + 1,
           cells = CASE WHEN $2 = ANY(google_place_discovery.cells)
                        THEN google_place_discovery.cells
                        ELSE array_append(google_place_discovery.cells, $2) END`,
    [ids, cell],
  );
}

/**
 * Branch-accurate Google identity with free ID-only searches: the venue's
 * own name restricted to a ~250 m box around its own position (then ~650 m
 * once). Same brand ≠ same branch: a chain name only links to the branch at
 * that position. Two Places resolving to one ID within 300 m with a similar
 * name are one physical venue; otherwise the ID is AMBIGUOUS.
 * Nothing but the ID is read or stored.
 */
async function linkGoogle(dataSource: DataSource): Promise<void> {
  const client = google();
  const limit = Number(option('--limit') ?? 10000);
  const rows = await dataSource.query<
    {
      id: number;
      name: string;
      latitude: string;
      longitude: string;
      identity: string;
      current: string | null;
      department: string;
      usage: number;
    }[]
  >(
    `SELECT p.id, p.name, p.latitude, p.longitude, p.identity_source AS identity,
            p.google_place_id AS current, d.name AS department,
            (SELECT count(*) FROM plan_detail pd WHERE pd.id_place = p.id)::int
              + (SELECT count(*) FROM activity_place ap WHERE ap.id_place = p.id AND ap.deleted_at IS NULL)::int AS usage
       FROM place p JOIN department d ON d.id = p.id_department
      WHERE p.deleted_at IS NULL AND p.latitude IS NOT NULL AND p.status = 'published'
      ORDER BY p.id LIMIT $1`,
    [limit],
  );
  const found = new Map<number, { id: string; confidence: number }>();
  const counts = { near: 0, wider: 0, unconfirmed: 0, none: 0, error: 0 };
  let done = 0;
  const work = async (row: (typeof rows)[number]) => {
    const point = {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    };
    try {
      for (const [half, confidence] of [
        [0.0025, 0.9],
        [0.006, 0.7],
      ] as const) {
        const { ids } = await client.searchPlaceIds(row.name, {
          pageSize: 1,
          restrict: { ...point, halfSideDegrees: half },
        });
        if (ids[0]) {
          // A restricted name search always returns the nearest similar
          // venue, even when this one is not on Google (closed, renamed):
          // an independent name + department search must agree.
          const named = await client.searchPlaceIds(
            `${row.name}, ${row.department}, Mendoza`,
            { pageSize: 5 },
          );
          if (!named.ids.includes(ids[0])) {
            counts.unconfirmed += 1;
            return;
          }
          found.set(row.id, { id: ids[0], confidence });
          counts[confidence === 0.9 ? 'near' : 'wider'] += 1;
          return;
        }
      }
      counts.none += 1;
    } catch (error) {
      counts.error += 1;
      if (counts.error < 5)
        console.warn(error instanceof Error ? error.message : String(error));
    } finally {
      done += 1;
      if (done % 300 === 0) console.log(`${done}/${rows.length}`, counts);
    }
  };
  for (let index = 0; index < rows.length; index += 8)
    await Promise.all(rows.slice(index, index + 8).map(work));

  // Group by ID: one physical venue, duplicates, or ambiguity.
  const byId = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const hit = found.get(row.id);
    if (hit) byId.set(hit.id, [...(byId.get(hit.id) ?? []), row]);
  }
  const result = { linked: 0, changed: 0, merged: 0, ambiguous: 0, cleared: 0 };
  const assign = new Map<number, string | null>();
  for (const [googleId, owners] of byId) {
    if (owners.length === 1) {
      assign.set(owners[0].id, googleId);
      continue;
    }
    const [keep, ...rest] = [...owners].sort(
      (a, b) =>
        b.usage - a.usage ||
        Number(b.identity === 'SMARTPLAN') -
          Number(a.identity === 'SMARTPLAN') ||
        a.id - b.id,
    );
    const sameVenue = rest.every(
      (other) =>
        nameSimilarity(other.name, keep.name) >= 0.5 &&
        distanceMeters(
          {
            latitude: Number(other.latitude),
            longitude: Number(other.longitude),
          },
          {
            latitude: Number(keep.latitude),
            longitude: Number(keep.longitude),
          },
        ) <= 300,
    );
    if (!sameVenue) {
      result.ambiguous += 1;
      for (const owner of owners) assign.set(owner.id, null);
      await dataSource.query(
        `INSERT INTO google_place_discovery (google_place_id, first_seen_at, last_seen_at, hits, cells, resolution, resolution_method)
         VALUES ($1, now(), now(), 1, ARRAY['link'], 'AMBIGUOUS', $2)
         ON CONFLICT (google_place_id) WHERE deleted_at IS NULL DO UPDATE
           SET resolution = 'AMBIGUOUS', resolution_method = $2, id_place = NULL`,
        [googleId, `places ${owners.map((o) => o.id).join(',')}`.slice(0, 60)],
      );
      continue;
    }
    assign.set(keep.id, googleId);
    for (const other of rest) {
      // Only an ODbL-created Place with no plans or offerings is merged away.
      if (other.identity !== 'OSM_ODBL' || other.usage > 0) {
        assign.set(other.id, null);
        continue;
      }
      await dataSource.query(
        `UPDATE place SET deleted_at = now(), google_place_id = NULL WHERE id = $1`,
        [other.id],
      );
      await dataSource.query(
        `UPDATE odbl_feature SET id_place = $2, match_status = 'DUPLICATE', match_note = $3 WHERE id_place = $1`,
        [other.id, keep.id, `same Google identity as place ${keep.id}`],
      );
      result.merged += 1;
    }
  }
  // Clear first so a moved ID never collides between two Places.
  await dataSource.query(
    `UPDATE place SET google_place_id = NULL WHERE id = ANY($1)`,
    [rows.map((row) => row.id)],
  );
  for (const row of rows) {
    const id = assign.get(row.id) ?? null;
    if (!id) {
      if (row.current) result.cleared += 1;
      continue;
    }
    if (row.current && row.current !== id) result.changed += 1;
    result.linked += 1;
    await dataSource.query(
      `UPDATE place SET google_place_id = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [row.id, id],
    );
    await dataSource.query(
      `INSERT INTO google_place_discovery (google_place_id, first_seen_at, last_seen_at, hits, cells, id_place, resolution, resolution_method, confidence, resolved_at)
       VALUES ($1, now(), now(), 1, ARRAY['link'], $2, 'LINKED', 'ids-only:name+restricted-box', $3, now())
       ON CONFLICT (google_place_id) WHERE deleted_at IS NULL DO UPDATE
         SET id_place = $2, resolution = 'LINKED', resolution_method = EXCLUDED.resolution_method,
             confidence = $3, resolved_at = now()`,
      [id, row.id, found.get(row.id)!.confidence],
    );
  }
  // IDs no Place holds any more are unresolved again.
  await dataSource.query(
    `UPDATE google_place_discovery g SET id_place = NULL, resolution = 'UNRESOLVED'
      WHERE g.resolution = 'LINKED' AND NOT EXISTS (
        SELECT 1 FROM place p WHERE p.google_place_id = g.google_place_id AND p.deleted_at IS NULL)`,
  );
  console.log(
    JSON.stringify({ candidates: rows.length, ...counts, ...result }),
  );
}

/** Google primary types → the OSM-style hint kind promotion understands. */
function hintKind(primaryType: string | null): string | null {
  if (!primaryType) return null;
  if (
    /^(bar|pub|gastropub|wine_bar|cocktail_bar|lounge_bar|night_club|brewpub|brewery|beer_hall|beer_garden|bar_and_grill)$/.test(
      primaryType,
    )
  )
    return 'bar';
  if (
    /(^|_)restaurant$|^(hamburger_restaurant|pizza_restaurant|steak_house|fast_food_restaurant|brunch_restaurant|food_court|diner|bistro)$/.test(
      primaryType,
    )
  )
    return 'restaurant';
  if (
    /^(cafe|coffee_shop|tea_house|bakery|pastry_shop|cafeteria|breakfast_restaurant)$/.test(
      primaryType,
    )
  )
    return 'cafe';
  if (/^(ice_cream_shop|dessert_shop)$/.test(primaryType)) return 'ice_cream';
  if (/^(winery|wine_cellar)$/.test(primaryType)) return 'winery';
  return null;
}

/**
 * Discovered Place IDs SmartPlan has no durable identity for → official
 * source → verified Place. One Place Details Enterprise call per ID (USD 0:
 * only within the free share and SmartPlan's own monthly cap) gives the
 * name/position/website used as a pointer and a check for that run only;
 * what is stored comes from the venue's own site and Georef (plus the
 * Place ID). Venues without an official site stay NO_DURABLE_IDENTITY.
 */
async function resolveIds(dataSource: DataSource): Promise<void> {
  const client = google();
  const usage = new ExternalDataUsageService(
    dataSource.getRepository(ExternalProvider),
    dataSource.getRepository(ExternalDataUsage),
  );
  const limit = Number(option('--limit') ?? 40);
  const explicit = option('--ids')?.split(',').filter(Boolean) ?? [];
  const monthlyCap = Math.min(
    Number(process.env.DISCOVERY_RESOLVE_MONTHLY_CAP ?? 150),
    300,
  );
  const now = new Date();
  const since = startOfBudgetMonth(now);
  const sku = GOOGLE_SKU_BY_CONTEXT['discovery-resolve'];
  const others = (
    Object.keys(GOOGLE_SKU_BY_CONTEXT) as GoogleUsageContext[]
  ).filter(
    (context) =>
      context !== 'discovery-resolve' && GOOGLE_SKU_BY_CONTEXT[context] === sku,
  );
  const usedElsewhere = await usage.countSince(others, since);
  const cap = Math.max(
    0,
    Math.min(monthlyCap, trustedFreeRequests(sku) - usedElsewhere),
  );
  const rows = explicit.length
    ? explicit.map((id) => ({ google_place_id: id }))
    : await dataSource.query<{ google_place_id: string }[]>(
        `SELECT google_place_id FROM google_place_discovery
          WHERE deleted_at IS NULL AND resolution = 'UNRESOLVED' AND id_place IS NULL
            AND EXISTS (SELECT 1 FROM unnest(cells) c
                         WHERE c LIKE 'live:%' OR c ~ '^(bar|cocktail|vermuteria|brewery|wine-bar|restaurant|cafe|brunch|burger|pizza|rooftop|live-music|merienda|ice-cream)@')
          ORDER BY cardinality(cells) DESC, hits DESC
          LIMIT $1`,
        [limit],
      );
  const counts: Record<string, number> = {};
  const count = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  const mark = (id: string, resolution: string, method: string) =>
    dataSource.query(
      `INSERT INTO google_place_discovery (google_place_id, first_seen_at, last_seen_at, hits, cells, resolution, resolution_method, resolved_at)
       VALUES ($1, now(), now(), 1, ARRAY['resolve'], $2, $3, now())
       ON CONFLICT (google_place_id) WHERE deleted_at IS NULL DO UPDATE
         SET resolution = $2, resolution_method = $3, resolved_at = now()`,
      [id, resolution, method],
    );
  for (const { google_place_id: id } of rows) {
    const known = await dataSource.query<{ id: number }[]>(
      'SELECT id FROM place WHERE google_place_id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (known.length) {
      count('already_linked');
      continue;
    }
    if (
      !(await usage.reserveWithinCap(
        GOOGLE_MAPS_PROVIDER_KEY,
        id,
        'discovery-resolve',
        cap,
        since,
      ))
    ) {
      count('cap_reached');
      break;
    }
    let hint: Awaited<
      ReturnType<GoogleMapsClientService['getPlaceIdentityHint']>
    >;
    try {
      hint = await client.getPlaceIdentityHint(id);
    } catch (error) {
      count('provider_error');
      console.warn(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (!hint) {
      count('no_hint');
      continue;
    }
    if (hint.businessStatus && hint.businessStatus !== 'OPERATIONAL') {
      await mark(
        id,
        'NO_DURABLE_IDENTITY',
        `not_operational:${hint.businessStatus}`.slice(0, 60),
      );
      count('not_operational');
      continue;
    }
    const kind = hintKind(hint.primaryType);
    if (!kind) {
      await mark(
        id,
        'NO_DURABLE_IDENTITY',
        `unsupported_type:${hint.primaryType}`.slice(0, 60),
      );
      count('unsupported_type');
      continue;
    }
    // A social profile or link hub is not a venue's own site.
    if (
      !hint.website ||
      /instagram\.com|facebook\.com|wa\.me|whatsapp|tiktok\.com/i.test(
        hint.website,
      )
    ) {
      await mark(
        id,
        'NO_DURABLE_IDENTITY',
        hint.website ? 'social_only' : 'no_website',
      );
      count(hint.website ? 'social_only' : 'no_website');
      console.log(
        `NO SITE   ${hint.name} (${kind})${hint.website ? ` ${new URL(hint.website).hostname}` : ''}`,
      );
      continue;
    }
    const outcome = await promote(dataSource, {
      hints: [
        {
          name: hint.name,
          latitude: hint.latitude,
          longitude: hint.longitude,
          kind,
          website: hint.website,
          googlePlaceId: id,
        },
      ],
      georefCache: join(LOCAL, 'georef-promote.json'),
      limit: 1,
      dryRun: false,
      hintTimeoutMs: 60000,
    });
    const [place] = await dataSource.query<{ id: number }[]>(
      'SELECT id FROM place WHERE google_place_id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (place) {
      await dataSource.query(
        `UPDATE google_place_discovery SET id_place = $2, resolution = 'LINKED', resolution_method = 'official-site', confidence = 0.8, resolved_at = now()
          WHERE google_place_id = $1 AND deleted_at IS NULL`,
        [id, place.id],
      );
      count('resolved');
    } else {
      await mark(
        id,
        'NO_DURABLE_IDENTITY',
        `official_unverified:${Object.keys(outcome).join('+')}`.slice(0, 60),
      );
      count('official_unverified');
    }
  }
  console.log(JSON.stringify({ candidates: rows.length, cap, ...counts }));
}

async function allPages(
  client: GoogleMapsClientService,
  query: string,
  zone: DiscoveryZone,
  pages: number,
): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;
  for (let page = 0; page < pages; page += 1) {
    const result = await client.searchPlaceIds(query, {
      pageToken: token,
      bias: { ...zone.centre, radiusMeters: zone.radiusMeters },
    });
    ids.push(...result.ids);
    if (!result.nextPageToken) break;
    token = result.nextPageToken;
  }
  return ids;
}

/** Zones × categories × intents, ID-only. Records the SmartPlan cell per ID. */
async function matrix(dataSource: DataSource): Promise<void> {
  const client = google();
  const pages = Number(option('--pages') ?? 3);
  const zoneFilter = option('--zones')?.split(',');
  const zones = DISCOVERY_ZONES.filter(
    (zone) => !zoneFilter || zoneFilter.includes(zone.key),
  );
  const linked = new Map(
    (
      await dataSource.query<{ id: number; google_place_id: string }[]>(
        'SELECT id, google_place_id FROM place WHERE google_place_id IS NOT NULL AND deleted_at IS NULL',
      )
    ).map((row) => [row.google_place_id, Number(row.id)]),
  );
  const summary: Record<string, { ids: number; known: number }> = {};
  for (const zone of zones) {
    const cells = DISCOVERY_CATEGORIES.map((category) => ({
      cell: `${category.key}@${zone.key}`,
      query: `${category.query} ${zone.label}`,
    }));
    for (let index = 0; index < cells.length; index += 4) {
      await Promise.all(
        cells.slice(index, index + 4).map(async ({ cell, query }) => {
          try {
            const ids = [
              ...new Set(await allPages(client, query, zone, pages)),
            ];
            await recordIds(dataSource, ids, cell);
            summary[cell] = {
              ids: ids.length,
              known: ids.filter((id) => linked.has(id)).length,
            };
          } catch (error) {
            console.warn(
              `${cell}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }),
      );
    }
    console.log(zone.key, 'done');
  }
  // Discovery IDs that are a SmartPlan Place's identity are resolved.
  await dataSource.query(
    `UPDATE google_place_discovery g SET id_place = p.id, resolution = 'LINKED',
            resolution_method = COALESCE(g.resolution_method, 'place.google_place_id'), resolved_at = COALESCE(g.resolved_at, now())
       FROM place p WHERE p.google_place_id = g.google_place_id AND p.deleted_at IS NULL AND g.id_place IS NULL`,
  );
  writeFileSync(
    join(LOCAL, `matrix-${new Date().toISOString().slice(0, 10)}.json`),
    JSON.stringify(summary, null, 1),
  );
  const [totals] = await dataSource.query<{ ids: string; linked: string }[]>(
    `SELECT count(*) AS ids, count(id_place) AS linked FROM google_place_discovery WHERE deleted_at IS NULL`,
  );
  console.log(
    JSON.stringify({ cells: Object.keys(summary).length, ...totals }),
  );
}

/**
 * Obvious-Mendoza regression suite. A canary's identity is the first ID of
 * its own name query; it passes when (1) the ID is resolved to a SmartPlan
 * Place and (2) the intent queries it should appear in return it.
 */
async function canaries(dataSource: DataSource): Promise<void> {
  const client = google();
  const results: {
    canary: string;
    googleIds: string[];
    resolvedPlaces: {
      id: number;
      name: string;
      department: string;
      kind: string;
    }[];
    discoveredBy: Record<string, string>;
    resolved: boolean;
  }[] = [];
  for (const canary of CANARIES) {
    const identity = await client.searchPlaceIds(canary.identityQuery, {
      pageSize: canary.branches ?? 1,
    });
    const intentIds = new Map<string, string[]>();
    for (const query of canary.intentQueries) {
      const ids: string[] = [];
      let token: string | undefined;
      for (let page = 0; page < 3; page += 1) {
        const result = await client.searchPlaceIds(query, { pageToken: token });
        ids.push(...result.ids);
        if (!result.nextPageToken) break;
        token = result.nextPageToken;
      }
      intentIds.set(query, ids);
    }
    const places = await dataSource.query<
      {
        id: number;
        name: string;
        google_place_id: string;
        department: string;
        kind: string;
      }[]
    >(
      `SELECT p.id, p.name, p.google_place_id, d.name AS department, p.kind FROM place p
         JOIN department d ON d.id = p.id_department
        WHERE p.google_place_id = ANY($1) AND p.deleted_at IS NULL`,
      [identity.ids],
    );
    results.push({
      canary: canary.name,
      googleIds: identity.ids,
      resolvedPlaces: places,
      discoveredBy: Object.fromEntries(
        [...intentIds].map(([query, ids]) => [
          query,
          identity.ids.some((id) => ids.includes(id))
            ? `yes (of ${ids.length})`
            : `no (of ${ids.length})`,
        ]),
      ),
      resolved: places.length > 0,
    });
  }
  const out = option('--out');
  if (out) writeFileSync(out, JSON.stringify(results, null, 1));
  for (const result of results)
    console.log(
      `${result.resolved ? 'RESOLVED  ' : 'UNRESOLVED'} ${result.canary} → ${result.resolvedPlaces.map((p) => `#${p.id} ${p.name} (${p.department}, ${p.kind})`).join('; ') || '—'} | ${Object.entries(
        result.discoveredBy,
      )
        .map(([q, v]) => `${q}: ${v}`)
        .join(' | ')}`,
    );
}

async function report(dataSource: DataSource): Promise<void> {
  const rows = await dataSource.query<
    {
      department: string;
      kind: string;
      places: string;
      google: string;
      osm: string;
    }[]
  >(
    `SELECT d.name AS department, p.kind, count(*) AS places,
            count(p.google_place_id) AS google,
            count(*) FILTER (WHERE p.identity_source = 'OSM_ODBL') AS osm
       FROM place p JOIN department d ON d.id = p.id_department
      WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.latitude IS NOT NULL
      GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
  );
  const lines = [
    '| Department | Kind | Located places | With Google ID | ODbL identity |',
    '|---|---|---:|---:|---:|',
  ];
  for (const row of rows)
    lines.push(
      `| ${row.department} | ${row.kind} | ${row.places} | ${row.google} | ${row.osm} |`,
    );
  const [index] = await dataSource.query<Record<string, string>[]>(
    `SELECT count(*) AS ids, count(id_place) AS linked,
            count(*) FILTER (WHERE resolution = 'AMBIGUOUS') AS ambiguous
       FROM google_place_discovery WHERE deleted_at IS NULL`,
  );
  lines.push('', `Discovery index: ${JSON.stringify(index)}`);
  const out = option('--out');
  if (out) writeFileSync(out, lines.join('\n'));
  console.log(lines.join('\n'));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const write = ['osm-import', 'link-google', 'matrix', 'resolve-ids'].includes(
    command,
  );
  const dataSource = await open(write);
  try {
    if (command === 'osm-import') await osmImport(dataSource);
    else if (command === 'link-google') await linkGoogle(dataSource);
    else if (command === 'matrix') await matrix(dataSource);
    else if (command === 'resolve-ids') await resolveIds(dataSource);
    else if (command === 'canaries') await canaries(dataSource);
    else if (command === 'report') await report(dataSource);
    else throw new Error(`Unknown command ${command}`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
