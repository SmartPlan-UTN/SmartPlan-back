/**
 * `knowledge promote`: hints (OSM names/points/websites, name-derived
 * domains) → official site → verified Place. See promotion.ts for the rules;
 * no OSM content is persisted.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolvePublicHost } from './fetch/deadline';
import type { DataSource } from 'typeorm';
import {
  guessDomains,
  namesMatch,
  osmHints,
  usableSourceUrl,
  type CatalogPlace,
} from './discovery';
import { extractBusinessFacts } from './extract/business-facts';
import { readPage } from './extract/page';
import { PoliteFetcher } from './fetch/polite-fetcher';
import { GeorefClient } from './georef';
import { PlaceSource } from './entities/place-source.entity';
import {
  distanceMeters,
  kindFromPage,
  officialAddresses,
  officialName,
  slugify,
  type VenueHint,
} from './promotion';

const GASTRONOMY_HINTS = new Set([
  'restaurant',
  'fast_food',
  'cafe',
  'bar',
  'pub',
  'biergarten',
  'ice_cream',
  'winery',
  'wine_cellar',
]);
const PROMOTABLE_KINDS = new Set([
  'restaurant',
  'cafe',
  'bar',
  'brewery',
  'ice_cream',
  'winery',
]);
const HINT_TO_KIND: Record<string, string> = {
  restaurant: 'restaurant',
  fast_food: 'restaurant',
  cafe: 'cafe',
  bar: 'bar',
  pub: 'bar',
  ice_cream: 'ice_cream',
  winery: 'winery',
  wine_cellar: 'winery',
};

type KnownPlace = CatalogPlace & { status: string; kind: string | null };

export interface PromoteOptions {
  osmFile?: string;
  /**
   * In-memory hints instead of an OSM file (e.g. a Google Place ID's live
   * name/position/website, used for this check only and never stored).
   */
  hints?: (VenueHint & { googlePlaceId?: string })[];
  georefCache: string;
  limit: number;
  dryRun: boolean;
  hintTimeoutMs?: number;
  checkpointFile?: string;
}

export async function promote(
  dataSource: DataSource,
  options: PromoteOptions,
): Promise<Record<string, number>> {
  if (!Number.isInteger(options.limit) || options.limit < 1)
    throw new Error('Promotion limit must be a positive integer.');
  if (
    options.hintTimeoutMs !== undefined &&
    (!Number.isInteger(options.hintTimeoutMs) ||
      options.hintTimeoutMs < 1 ||
      options.hintTimeoutMs > 600000)
  )
    throw new Error('Hint timeout must be between 1 and 600000 ms.');
  const hints: (VenueHint & { googlePlaceId?: string })[] =
    options.hints ??
    osmHints(
      JSON.parse(readFileSync(options.osmFile ?? '', 'utf8')) as {
        elements: unknown[];
      },
    ).filter((hint) => GASTRONOMY_HINTS.has(hint.kind));
  const places = await dataSource.query<KnownPlace[]>(
    `SELECT p.id, p.slug, p.name, p.status, p.kind, p.latitude::float AS latitude,
            p.longitude::float AS longitude, d.name AS "departmentName"
       FROM place p LEFT JOIN department d ON d.id = p.id_department
      WHERE p.deleted_at IS NULL`,
  );
  const departments = new Map(
    (
      await dataSource.query<{ id: number; name: string }[]>(
        'SELECT id, name FROM department WHERE deleted_at IS NULL',
      )
    ).map((row) => [row.name, Number(row.id)]),
  );
  const georef = new GeorefClient(options.georefCache);
  const fetcher = new PoliteFetcher();
  // Hints already represented by a located catalog place need no promotion.
  const completed = new Set<string>();
  const hintKey = (hint: (typeof hints)[number]) =>
    JSON.stringify([hint.name, hint.latitude, hint.longitude, hint.website]);
  if (options.checkpointFile && existsSync(options.checkpointFile)) {
    for (const line of readFileSync(options.checkpointFile, 'utf8').split(
      /\r?\n/,
    )) {
      try {
        const entry = JSON.parse(line) as { key: string; at: number };
        if (entry.at > Date.now() - 86400000) completed.add(entry.key);
      } catch {
        // An incomplete last line after interruption is retried.
      }
    }
  }
  const pending = hints
    .filter((hint) => !completed.has(hintKey(hint)))
    .filter(
      (hint) =>
        !places.some(
          (place) =>
            place.latitude !== null &&
            place.longitude !== null &&
            namesMatch(place.name, hint.name) &&
            distanceMeters(
              { latitude: place.latitude, longitude: place.longitude },
              hint,
            ) <= 400,
        ),
    )
    .slice(0, options.limit);
  console.log(`hints ${hints.length}, pending ${pending.length}`);
  const outcome: Record<string, number> = {};
  const count = (key: string) => (outcome[key] = (outcome[key] ?? 0) + 1);
  const queue = [...pending];

  const promoteOne = async (
    hint: (typeof pending)[number],
    signal: AbortSignal,
  ) => {
    let transientFailure = false;
    const urls = new Set<string>();
    const site = hint.website ? usableSourceUrl(hint.website) : null;
    if (site) urls.add(site);
    for (const domain of guessDomains(
      hint.name,
      HINT_TO_KIND[hint.kind] ?? null,
    )) {
      try {
        const addresses = await resolvePublicHost(
          domain,
          AbortSignal.any([signal, AbortSignal.timeout(3000)]),
        );
        if (addresses.length) urls.add(`https://${domain}/`);
      } catch {
        signal.throwIfAborted();
        transientFailure = true;
        count('dns_error');
      }
    }
    if (!urls.size) {
      if (transientFailure) throw new Error('DNS unavailable; retry on resume');
      return count('no_candidate_url');
    }
    for (const url of urls) {
      signal.throwIfAborted();
      const fetched = await fetcher.get(url, signal);
      if (!fetched.ok || fetched.contentType !== 'html') {
        if (
          !fetched.ok &&
          ['network', 'timeout', 'http_error'].includes(fetched.reason)
        )
          transientFailure = true;
        count(`fetch_${fetched.ok ? 'not_html' : fetched.reason}`);
        continue;
      }
      const page = readPage(fetched.url, fetched.body.toString('utf8'));
      const facts = extractBusinessFacts(page, new Date());
      const strictName = officialName(page, facts, hint);
      const name = strictName ?? officialName(page, facts, hint, true);
      // A partial name match must be confirmed by a closer position.
      const maxMeters = strictName ? 500 : 300;
      if (!name) {
        if (process.env.KNOWLEDGE_DEBUG)
          console.log(
            'name?',
            hint.name,
            '|',
            page.url,
            '|',
            page.title.slice(0, 80),
            '|',
            page.siteName,
          );
        count('name_not_on_page');
        continue;
      }
      const kind = kindFromPage(page, hint.kind);
      if (!kind || !PROMOTABLE_KINDS.has(kind)) {
        if (process.env.KNOWLEDGE_DEBUG)
          console.log(
            'kind?',
            hint.name,
            hint.kind,
            '|',
            page.url,
            '|',
            page.title.slice(0, 80),
            kind,
          );
        count('kind_unclear');
        continue;
      }
      // Position: the publisher's own geo (≤300 m of the hint), else the
      // Georef point of the address the page publishes (≤500 m).
      let point: {
        latitude: number;
        longitude: number;
        ref: string;
        department: string;
        address: string;
      } | null = null;
      if (
        facts.geo &&
        distanceMeters(facts.geo, hint) <= Math.min(300, maxMeters)
      ) {
        const department = await georef.departmentAt(
          facts.geo.latitude,
          facts.geo.longitude,
          signal,
        );
        if (department)
          point = {
            ...facts.geo,
            ref: page.url,
            department,
            address: facts.addresses[0] ?? '',
          };
      }
      if (!point) {
        const hintDepartment = await georef.departmentAt(
          hint.latitude,
          hint.longitude,
          signal,
        );
        // The address is often on the site's own contact/location page.
        const addresses = officialAddresses(page, facts);
        if (!addresses.length) {
          const host = new URL(page.url).hostname;
          const contactLinks = page.links
            .filter(
              (link) =>
                new URL(link.href).hostname === host &&
                /contact|ubicaci|donde|dónde|sucursal|local|visit/i.test(
                  `${link.text} ${link.href}`,
                ),
            )
            .slice(0, 2);
          for (const link of contactLinks) {
            const contact = await fetcher.get(link.href, signal);
            if (!contact.ok || contact.contentType !== 'html') continue;
            const contactPage = readPage(
              contact.url,
              contact.body.toString('utf8'),
            );
            addresses.push(
              ...officialAddresses(
                contactPage,
                extractBusinessFacts(contactPage, new Date()),
              ),
            );
          }
        }
        for (const address of addresses) {
          const department = address.department ?? hintDepartment;
          if (!department) continue;
          const geocoded = await georef.geocode(
            address.street,
            address.number,
            department,
            signal,
          );
          if (geocoded && distanceMeters(geocoded, hint) <= maxMeters) {
            point = {
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
              ref: geocoded.ref,
              department,
              address: `${address.street} ${address.number}`,
            };
            break;
          }
        }
      }
      if (!point) {
        if (process.env.KNOWLEDGE_DEBUG)
          console.log(
            'addr?',
            name,
            '|',
            page.url,
            '|',
            JSON.stringify(officialAddresses(page, facts).slice(0, 3)),
            facts.geo,
          );
        count('no_verifiable_address');
        continue;
      }
      const idDepartment = departments.get(point.department);
      if (!idDepartment) {
        count('department_unknown');
        continue;
      }
      signal.throwIfAborted();
      if (options.dryRun) {
        console.log(
          `DRY ${kind.padEnd(10)} ${point.department.padEnd(18)} ${name} ← ${page.url}`,
        );
        return count('would_promote');
      }
      // An unlocated registry place with this name in that department is the
      // same venue: it gets the verified position and is published.
      const department = point.department;
      const existing = places.find(
        (place) =>
          place.latitude === null &&
          namesMatch(place.name, name) &&
          place.departmentName === department,
      );
      let placeId: number;
      if (existing) {
        await dataSource.query(
          `UPDATE place SET latitude = $2, longitude = $3, coordinates_ref = $4,
                  status = 'published', discoverable = true, verified_at = now(),
                  kind = COALESCE(kind, $5), updated_at = now(),
                  google_place_id = COALESCE(google_place_id, $6)
            WHERE id = $1`,
          [
            existing.id,
            point.latitude,
            point.longitude,
            point.ref.slice(0, 500),
            kind,
            hint.googlePlaceId ?? null,
          ],
        );
        existing.latitude = point.latitude;
        existing.longitude = point.longitude;
        placeId = existing.id;
        count('upgraded_registry_place');
      } else {
        let slug = slugify(name, department);
        if (places.some((place) => place.slug === slug))
          slug = `${slug}-${places.length}`;
        const [row] = await dataSource.query<{ id: number }[]>(
          `INSERT INTO place (name, address, id_department, latitude, longitude, slug,
                              status, kind, discoverable, verified_at, coordinates_ref, google_place_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'published', $7, true, now(), $8, $9)
           RETURNING id`,
          [
            name.slice(0, 150),
            (point.address || name).slice(0, 255),
            idDepartment,
            point.latitude,
            point.longitude,
            slug,
            kind,
            point.ref.slice(0, 500),
            hint.googlePlaceId ?? null,
          ],
        );
        placeId = Number(row.id);
        places.push({
          id: placeId,
          slug,
          name,
          status: 'published',
          kind,
          latitude: point.latitude,
          longitude: point.longitude,
          departmentName: department,
        });
        count('promoted');
      }
      await dataSource
        .createQueryBuilder()
        .insert()
        .into(PlaceSource)
        .values({
          idPlace: placeId,
          kind: 'OFFICIAL_SITE',
          url: page.url.slice(0, 500),
          discoveredVia: hint.googlePlaceId
            ? 'GOOGLE_WEBSITE_URI'
            : site === url
              ? 'OSM_HINT'
              : 'DOMAIN_GUESS',
          identityStatus: 'CANDIDATE',
          identitySignals: [],
        })
        .orIgnore()
        .execute();
      console.log(
        `${kind.padEnd(10)} ${department.padEnd(18)} ${name} ← ${page.url}`,
      );
      return;
    }
    count('not_promoted');
    if (transientFailure)
      throw new Error('Transient promotion failure; retry on resume');
  };

  let processed = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let hint = queue.shift(); hint; hint = queue.shift()) {
        const started = Date.now();
        const signal = AbortSignal.timeout(options.hintTimeoutMs ?? 90000);
        console.log(
          `START ${pending.length - queue.length}/${pending.length} ${hint.name}`,
        );
        try {
          await promoteOne(hint, signal);
          signal.throwIfAborted();
          if (!options.dryRun && options.checkpointFile)
            appendFileSync(
              options.checkpointFile,
              JSON.stringify({ key: hintKey(hint), at: Date.now() }) + '\n',
            );
        } catch {
          count(signal.aborted ? 'hint_timeout' : 'hint_error');
        } finally {
          processed += 1;
          console.log(
            `PROGRESS ${processed}/${pending.length} ${hint.name} ${Date.now() - started}ms ${JSON.stringify(outcome)}`,
          );
        }
      }
    }),
  );
  return outcome;
}
