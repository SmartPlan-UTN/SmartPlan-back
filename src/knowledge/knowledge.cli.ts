/**
 * pnpm knowledge <command> [--confirm <exact_local_database>]
 *
 *   discover  [--osm <overpass.json>]   hints â†’ CANDIDATE place sources
 *   acquire   [--limit N] [--places 1,2 | --all-gastronomy] fetch and verify sources
 *   revalidate [--limit N]              re-read sources of flagged places
 *   report    [--out file.md]           coverage per zone Ã— intent
 *
 * Writes require --confirm with the exact LOCAL database name. Nothing here
 * calls a paid provider; fetching obeys robots.txt and the domain policy.
 */
import 'reflect-metadata';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { assessDatabaseTarget } from '../config/database-target';
import {
  coverage,
  coverageMarkdown,
  intentEvidenceMarkdown,
  sourceStats,
} from './coverage-report';
import { resolvePublicHost } from './fetch/deadline';
import { domainPolicy } from './fetch/domain-policy';
import {
  guessDomains,
  wikidataSourceHints,
  osmHints,
  osmSourceHints,
  registrySourceHints,
  usableSourceUrl,
  reviewedSourceHints,
  type CatalogPlace,
  type SourceHint,
} from './discovery';
import { KnowledgeAcquisitionService } from './knowledge-acquisition.service';
import { promote } from './promote-command';
import { refreshCinemas } from './cinema/cinema-ingest';
import { GeorefClient } from './georef';
import { PlaceSource } from './entities/place-source.entity';
import { menuIndexHints } from './menu-discovery';
import { PoliteFetcher } from './fetch/polite-fetcher';
import { readPage } from './extract/page';
import { menuDiscoveryReport } from './menu-discovery-report';
import { defaultMenuIndexes } from './menu-source-discovery';
import { acquireSourceGraph } from './acquisition-run';

const CATALOG = join(__dirname, '../../catalog-data/mendoza-v1');

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
    throw new Error('Knowledge commands run on a local database only.');
  if (write && option('--confirm') !== target.database)
    throw new Error(
      `Writing requires --confirm ${target.database ?? '<local database>'}.`,
    );
  Object.assign(dataSource.options, {
    synchronize: false,
    migrationsRun: false,
    extra: {
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      lock_timeout: 5000,
    },
  });
  await dataSource.initialize();
  return dataSource;
}

function registryRows(): {
  name: string;
  department: string;
  contact: string;
}[] {
  const rows: { name: string; department: string; contact: string }[] = [];
  const read = (file: string, name: number, dept: number, contact: number) => {
    const path = join(CATALOG, 'raw', file);
    if (!existsSync(path)) return;
    for (const line of readFileSync(path, 'latin1').split(/\r?\n/).slice(1)) {
      const cells = line.split(';');
      if (cells[name])
        rows.push({
          name: cells[name],
          department: cells[dept] ?? '',
          contact: cells[contact] ?? '',
        });
    }
  };
  read('gastronomia.csv', 1, 5, 9);
  read('enoturismo.csv', 0, 3, 7);
  return rows;
}

async function discover(dataSource: DataSource): Promise<void> {
  const places = await dataSource.query<CatalogPlace[]>(
    `SELECT p.id, p.slug, p.name, p.latitude::float AS latitude, p.longitude::float AS longitude,
            d.name AS "departmentName"
       FROM place p LEFT JOIN department d ON d.id = p.id_department
      WHERE p.deleted_at IS NULL AND p.status IN ('published','in_review')`,
  );
  const bySlug = new Map(places.map((place) => [place.slug, place]));
  const hints: SourceHint[] = [];
  // Public provider indexes are discovery inputs, never price evidence.
  const menuIndexes =
    option('--menu-indexes')?.split(',') ?? defaultMenuIndexes();
  const fetcher = new PoliteFetcher();
  for (const url of menuIndexes) {
    const fetched = await fetcher.get(url);
    if (fetched.ok && fetched.contentType === 'html')
      hints.push(
        ...menuIndexHints(
          places,
          readPage(fetched.url, fetched.body.toString('utf8')),
        ),
      );
    else
      console.log(
        `MENU_INDEX_UNAVAILABLE ${fetched.ok ? fetched.contentType : fetched.reason} ${url}`,
      );
  }
  const sourceHintsFile = option('--sources');
  if (sourceHintsFile)
    hints.push(
      ...reviewedSourceHints(
        places,
        JSON.parse(readFileSync(sourceHintsFile, 'utf8')) as unknown,
      ),
    );

  // 1. Curated official refs (venue-owned or booking pages of offerings/places).
  const refs = await dataSource.query<{ id_place: number; ref: string }[]>(
    `SELECT DISTINCT ap.id_place, a.price_source_ref AS ref
       FROM activity a JOIN activity_place ap ON ap.id_activity = a.id AND ap.deleted_at IS NULL
      WHERE a.deleted_at IS NULL AND a.price_source_ref LIKE 'http%'
     UNION
     SELECT DISTINCT r.applied_entity_id, r.payload->>'sourceRef'
       FROM catalog_staging_record r
      WHERE r.entity_type = 'place' AND r.applied_entity_id IS NOT NULL
        AND r.payload->>'sourceRef' LIKE 'http%'`,
  );
  for (const ref of refs) {
    const url = usableSourceUrl(ref.ref);
    if (url && ref.id_place)
      hints.push({
        placeId: Number(ref.id_place),
        url,
        via: 'CATALOG_REF',
        match: 'curated ref',
      });
  }
  // 2. Google websiteUri captured for identity review (hint only).
  const websitesFile = join(CATALOG, '.local/websites.json');
  if (existsSync(websitesFile))
    for (const entry of JSON.parse(readFileSync(websitesFile, 'utf8')) as {
      slug: string;
      website: string | null;
    }[]) {
      const place = bySlug.get(entry.slug);
      const url = entry.website ? usableSourceUrl(entry.website) : null;
      if (place && url)
        hints.push({
          placeId: place.id,
          url,
          via: 'GOOGLE_WEBSITE_URI',
          match: 'websiteUri hint',
        });
    }
  // 3. Registry contacts.
  hints.push(...registrySourceHints(places, registryRows()));
  // 4. OSM website tags (hint only).
  const osmFile = option('--osm') ?? join(CATALOG, '.local/osm-hints.json');
  if (existsSync(osmFile))
    hints.push(
      ...osmSourceHints(
        places,
        osmHints(
          JSON.parse(readFileSync(osmFile, 'utf8')) as { elements: unknown[] },
        ),
      ),
    );

  // 5. Wikidata official websites (CC0).
  const wdFile = join(CATALOG, 'raw/wd-mendoza.csv');
  if (existsSync(wdFile)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parseCsv = require(join(CATALOG, 'parse-csv.cjs')) as (
      text: string,
      separator?: string,
    ) => string[][];
    const rows = parseCsv(readFileSync(wdFile, 'utf8'), ',').slice(1);
    hints.push(
      ...wikidataSourceHints(
        places,
        rows
          .filter((row) => row[4])
          .map((row) => ({
            label: row[1],
            latitude: Number(row[2]),
            longitude: Number(row[3]),
            site: row[4],
          })),
      ),
    );
  }
  // 6. Domains derived from the venue name, only when DNS resolves.
  if (process.argv.includes('--guess-domains')) {
    const kinds = await dataSource.query<{ id: number; kind: string }[]>(
      `SELECT id, kind FROM place WHERE deleted_at IS NULL
         AND kind IN ('restaurant','cafe','bar','brewery','ice_cream','bakery','winery','nightclub')
         AND id NOT IN (SELECT id_place FROM place_source WHERE deleted_at IS NULL)`,
    );
    const kindOf = new Map(kinds.map((row) => [Number(row.id), row.kind]));
    const guesses = places
      .filter((place) => kindOf.has(place.id))
      .flatMap((place) =>
        guessDomains(place.name, kindOf.get(place.id) ?? null).map(
          (domain) => ({
            place,
            domain,
          }),
        ),
      );
    const queue = [...guesses];
    const found: SourceHint[] = [];
    await Promise.all(
      Array.from({ length: 16 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          try {
            if (!(await resolvePublicHost(next.domain)).length) continue;
            found.push({
              placeId: next.place.id,
              url: `https://${next.domain}/`,
              via: 'DOMAIN_GUESS',
              match: `nameâ†’${next.domain}`,
            });
          } catch {
            /* no such domain */
          }
        }
      }),
    );
    console.log(
      `domain guesses: ${guesses.length} tried, ${found.length} resolve`,
    );
    hints.push(...found);
  }

  let added = 0;
  for (const hint of hints) {
    const host = new URL(hint.url).hostname;
    const platform = domainPolicy(host).platform;
    const kind = /\.pdf($|\?)/i.test(hint.url)
      ? 'MENU_PDF'
      : /wosbooking|meitre/.test(host)
        ? 'BOOKING_PROVIDER'
        : /linktr\.ee|bio\.site/.test(host)
          ? 'LINK_HUB'
          : platform === 'MENU_PLATFORM' || /\/(carta|menu)/i.test(hint.url)
            ? 'MENU_PAGE'
            : 'OFFICIAL_SITE';
    const result = await dataSource
      .createQueryBuilder()
      .insert()
      .into(PlaceSource)
      .values({
        idPlace: hint.placeId,
        kind,
        url: hint.url.slice(0, 500),
        discoveredVia: hint.via,
        identityStatus: 'CANDIDATE',
        identitySignals: [],
      })
      .orIgnore()
      .returning('id')
      .execute();
    if (Array.isArray(result.raw)) added += result.raw.length;
  }
  const byVia = hints.reduce<Record<string, number>>(
    (acc, h) => ({ ...acc, [h.via]: (acc[h.via] ?? 0) + 1 }),
    {},
  );
  console.log(
    JSON.stringify({ hints: hints.length, byVia, newSources: added }, null, 2),
  );
}

async function acquire(dataSource: DataSource): Promise<void> {
  const now = new Date();
  const limit = Number(option('--limit') ?? 400);
  const allGastronomy = process.argv.includes('--all-gastronomy');
  if (allGastronomy && option('--places'))
    throw new Error('--all-gastronomy and --places are mutually exclusive.');
  const placeIds = allGastronomy
    ? (
        await dataSource.query<{ id: number }[]>(
          `SELECT id FROM place WHERE deleted_at IS NULL AND kind IN
             ('restaurant','cafe','bar','brewery','ice_cream','bakery','winery','nightclub')
           ORDER BY id`,
        )
      ).map((place) => Number(place.id))
    : option('--places')?.split(',').map(Number);
  if (process.argv.includes('--refresh-selected') && !placeIds?.length)
    throw new Error('--refresh-selected requires explicit --places.');
  const service = new KnowledgeAcquisitionService(dataSource);
  const totals: Record<string, number> = {};
  const outcomes = await acquireSourceGraph(service, {
    now,
    limit,
    placeIds,
    concurrency: 8,
    retryTransient: process.argv.includes('--retry-transient'),
    refreshSelected: process.argv.includes('--refresh-selected'),
    onOutcome: (outcome, name) => {
      totals[outcome.status] = (totals[outcome.status] ?? 0) + 1;
      if (outcome.hours) totals.hours = (totals.hours ?? 0) + 1;
      if (outcome.menuItems) totals.menus = (totals.menus ?? 0) + 1;
      console.log(
        `${outcome.status} ${name} items=${outcome.menuItems} ${outcome.url}`,
      );
    },
  });
  const processed = outcomes.length;
  console.log(JSON.stringify({ processed, totals }, null, 2));
  if (option('--out'))
    writeFileSync(
      option('--out')!,
      JSON.stringify(
        {
          observedAt: now.toISOString(),
          processed,
          totals,
          distinctMenuVenues: [
            ...new Set(
              outcomes
                .filter((item) => item.menuItems > 0)
                .map((item) => item.placeId),
            ),
          ],
          outcomes,
        },
        null,
        2,
      ),
    );
}

async function report(dataSource: DataSource): Promise<void> {
  const now = new Date();
  const cells = await coverage(dataSource, now);
  const stats = await sourceStats(dataSource);
  const markdown = [
    `# Cobertura de conocimiento â€” ${now.toISOString()}`,
    '',
    coverageMarkdown(cells),
    '',
    await intentEvidenceMarkdown(dataSource, now),
    '',
    '## Fuentes',
    '',
    '| Identidad | Ãšltimo estado | Fuentes |',
    '|---|---|---:|',
    ...stats.sources.map(
      (row) =>
        `| ${row.identity_status} | ${row.last_status ?? 'â€”'} | ${row.count} |`,
    ),
    '',
    '## Hechos por tipo (lugares)',
    '',
    '| Hecho | MÃ©todo | Lugares |',
    '|---|---|---:|',
    ...stats.facts.map(
      (row) => `| ${row.kind} | ${row.method} | ${row.places} |`,
    ),
    '',
    '## Cola de revalidaciÃ³n',
    '',
    '| Motivo | Estado | Cantidad |',
    '|---|---|---:|',
    ...stats.queue.map(
      (row) => `| ${row.reason} | ${row.status} | ${row.count} |`,
    ),
  ].join('\n');
  const out = option('--out');
  if (out) writeFileSync(out, markdown);
  console.log(markdown);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const write = [
    'discover',
    'acquire',
    'revalidate',
    'promote',
    'cinemas',
  ].includes(command);
  if (
    ![
      'discover',
      'acquire',
      'revalidate',
      'promote',
      'cinemas',
      'report',
      'menu-report',
    ].includes(command)
  )
    throw new Error(
      'Usage: knowledge <discover|acquire|revalidate|report> [--confirm <local_db>]',
    );
  const dataSource = await open(write);
  try {
    if (command === 'discover') await discover(dataSource);
    if (command === 'promote')
      console.log(
        JSON.stringify(
          await promote(dataSource, {
            osmFile: option('--osm') ?? join(CATALOG, '.local/osm-hints.json'),
            georefCache: join(CATALOG, '.local/georef-knowledge-cache.json'),
            limit: Number(option('--limit') ?? 2000),
            dryRun: process.argv.includes('--dry-run'),
            checkpointFile:
              option('--checkpoint') ??
              join(CATALOG, '.local/promotion-checkpoint.jsonl'),
            hintTimeoutMs: Number(option('--hint-timeout-ms') ?? 90000),
          }),
          null,
          2,
        ),
      );
    if (command === 'acquire') await acquire(dataSource);
    if (command === 'revalidate')
      console.log(
        await new KnowledgeAcquisitionService(dataSource).workRevalidations(
          Number(option('--limit') ?? 50),
          new Date(),
        ),
      );
    if (command === 'cinemas')
      console.log(
        JSON.stringify(
          await refreshCinemas(
            dataSource,
            new GeorefClient(
              join(CATALOG, '.local/georef-knowledge-cache.json'),
            ),
          ),
          null,
          2,
        ),
      );
    if (command === 'report') await report(dataSource);
    if (command === 'menu-report') {
      const result = await menuDiscoveryReport(
        dataSource,
        new Date(),
        option('--places')?.split(',').map(Number),
      );
      const json = JSON.stringify(result, null, 2);
      if (option('--out')) writeFileSync(option('--out')!, json);
      console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
