import type { DataSource } from 'typeorm';
import type { MenuObservation } from '../planning-engine/menu/menu';
import { intentBasket } from '../planning-engine/menu/menu-intelligence';

/** Read-only, distinct-venue economic coverage using the planner's actual recipes. */
export async function menuDiscoveryReport(
  db: DataSource,
  now: Date,
  placeIds?: number[],
) {
  const venues = await db.query<
    Array<{
      id: number;
      name: string;
      zone: string;
      kind: string;
      googlePlaceId: string | null;
      latitude: number | null;
      longitude: number | null;
    }>
  >(
    `SELECT p.id,p.name,p.kind,d.name AS zone,p.google_place_id AS "googlePlaceId",p.latitude::float,p.longitude::float
       FROM place p LEFT JOIN department d ON d.id=p.id_department
      WHERE p.deleted_at IS NULL AND ($1::int[] IS NULL OR p.id=ANY($1))
        AND p.kind IN ('restaurant','cafe','bar','brewery','bakery','winery') ORDER BY p.id`,
    [placeIds ?? null],
  );
  const ids = venues.map((venue) => venue.id);
  const sources = await db.query<
    Array<{
      placeId: number;
      url: string;
      kind: string;
      identity: string;
      status: string;
      signals: string[];
      nextCheckAt: Date | null;
    }>
  >(
    `SELECT id_place AS "placeId",url,kind,identity_status AS identity,last_status AS status,identity_signals AS signals,next_check_at AS "nextCheckAt" FROM place_source WHERE deleted_at IS NULL AND id_place=ANY($1) ORDER BY id`,
    [ids],
  );
  const menus = await db.query<
    Array<{ placeId: number; menu: MenuObservation }>
  >(
    `SELECT id_place AS "placeId",jsonb_build_object('sourceUrl',source_url,'observedAt',observed_at,'sourceUpdatedAt',source_updated_at,'expiresAt',expires_at,'contentHash',content_hash,'items',items) AS menu
       FROM (SELECT DISTINCT ON (id_place,source_url) * FROM place_menu_observation WHERE deleted_at IS NULL AND id_place=ANY($1) ORDER BY id_place,source_url,observed_at DESC,id DESC) latest
      WHERE expires_at>$2 AND observed_at<=$2 ORDER BY observed_at DESC`,
    [ids, now],
  );
  const rows = venues.map((venue) => {
    const ownSources = sources.filter((source) => source.placeId === venue.id);
    const ownMenus = menus
      .filter((menu) => menu.placeId === venue.id)
      .map((row) => row.menu);
    const examples = (
      ['dinner', 'lunch', 'breakfast', 'merienda', 'beer', 'drinks'] as const
    ).flatMap((experience) => {
      for (const menu of ownMenus) {
        const basket = intentBasket(
          menu,
          {
            people: 4,
            experience,
            moment:
              experience === 'beer' || experience === 'drinks'
                ? 'dinner'
                : experience,
            occasion: 'friends',
            style: 'LIGHT',
          },
          now,
        );
        if (basket)
          return [
            {
              experience,
              basket,
              sourceUpdatedAt: menu.sourceUpdatedAt,
              confidence: menu.sourceUpdatedAt
                ? 'dated_official_menu'
                : 'official_menu_observed_publisher_date_unknown',
            },
          ];
      }
      return [];
    });
    return {
      ...venue,
      sources: ownSources,
      candidates: ownSources.some(
        (source) => source.kind === 'MENU_PAGE' || source.kind === 'MENU_PDF',
      ),
      discovered: ownSources.some(
        (source) =>
          source.identity === 'VERIFIED' &&
          (source.kind === 'MENU_PAGE' || source.kind === 'MENU_PDF'),
      ),
      extractedItems: ownMenus.reduce(
        (sum, menu) => sum + menu.items.length,
        0,
      ),
      examples,
      economicallyUseful: examples.length > 0,
      usableInLocatedCatalog:
        examples.length > 0 &&
        venue.latitude !== null &&
        venue.longitude !== null,
    };
  });
  return {
    observedAt: now.toISOString(),
    venues: rows.length,
    candidates: rows.filter((row) => row.candidates).length,
    discovered: rows.filter((row) => row.discovered).length,
    acquired: rows.filter((row) => row.extractedItems > 0).length,
    economicallyUseful: rows.filter((row) => row.economicallyUseful).length,
    locatedEconomicVenues: rows.filter((row) => row.usableInLocatedCatalog)
      .length,
    rows,
  };
}
