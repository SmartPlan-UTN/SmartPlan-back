import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import type { CatalogPlace } from './discovery';
import { PlaceSource } from './entities/place-source.entity';
import { readPage } from './extract/page';
import { PoliteFetcher } from './fetch/polite-fetcher';
import { menuIndexHints } from './menu-discovery';

export function defaultMenuIndexes(): string[] {
  return JSON.parse(
    readFileSync(
      join(
        __dirname,
        '../../catalog-data/mendoza-v1/menu-provider-indexes.json',
      ),
      'utf8',
    ),
  ) as string[];
}

/** Provider listings find candidates without trusting their menus as facts. */
export async function discoverMenuSources(
  db: DataSource,
  indexes = defaultMenuIndexes(),
  fetcher = new PoliteFetcher(),
) {
  const places = await db.query<CatalogPlace[]>(
    `SELECT id,slug,name,latitude::float,longitude::float FROM place WHERE deleted_at IS NULL AND kind IN ('restaurant','cafe','bar','brewery','bakery','winery')`,
  );
  let candidates = 0;
  let added = 0;
  let updated = 0;
  const unavailable: string[] = [];
  for (const url of indexes.slice(0, 10)) {
    const fetched = await fetcher.get(url);
    if (!fetched.ok || fetched.contentType !== 'html') {
      unavailable.push(url);
      continue;
    }
    const hints = menuIndexHints(
      places,
      readPage(fetched.url, fetched.body.toString('utf8')),
    );
    candidates += hints.length;
    for (const hint of hints.slice(0, 200)) {
      const refreshed = await db.query<{ id: number }[]>(
        `UPDATE place_source SET kind = 'MENU_PAGE', discovered_via = 'REGISTRY'
          WHERE id_place = $1 AND url = $2 AND kind <> 'MENU_PAGE'
            AND deleted_at IS NULL RETURNING id`,
        [hint.placeId, hint.url],
      );
      if (refreshed.length) {
        updated += refreshed.length;
        continue;
      }
      const result = await db
        .createQueryBuilder()
        .insert()
        .into(PlaceSource)
        .values({
          idPlace: hint.placeId,
          kind: 'MENU_PAGE',
          url: hint.url,
          discoveredVia: 'REGISTRY',
          identityStatus: 'CANDIDATE',
          identitySignals: [`discovery_index:${url}`],
        })
        .orUpdate(['kind', 'discoveredVia'], ['idPlace', 'url'])
        .returning('id')
        .execute();
      if (Array.isArray(result.raw)) added += result.raw.length;
    }
  }
  return { indexes: indexes.length, candidates, added, updated, unavailable };
}
