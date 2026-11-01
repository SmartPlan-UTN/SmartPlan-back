/**
 * Refreshes the screenings of every compliant cinema source. A screening is
 * dynamic inventory: each run replaces the observed window for that cinema
 * (a screening that disappeared from the official schedule is withdrawn),
 * and an observation expires after ~30 h or when the screening starts.
 */
import type { DataSource } from 'typeorm';
import { PoliteFetcher } from '../fetch/polite-fetcher';
import { GeorefClient } from '../georef';
import {
  CINEMARK_ORIGIN,
  flightText,
  objectAt,
  parseCartelera,
  parsePrices,
  ticketPrice,
} from './cinemark';

export interface CinemaSource {
  chain: 'cinemark';
  /** Path segment of the complex on the chain site. */
  slug: string;
  chainId: number;
  /** How SmartPlan names it (brand + complex), and its published address. */
  name: string;
  street: string;
  number: string;
  department: string;
  placeSlug: string;
}

/**
 * Compliant sources (docs/knowledge/cinema-sources.md). Cinépolis (ex
 * Village) answers automated clients with a challenge page: not fetched.
 */
export const CINEMA_SOURCES: CinemaSource[] = [
  {
    chain: 'cinemark',
    slug: 'mendoza',
    chainId: 732,
    name: 'Cinemark Mendoza (Palmares)',
    street: 'San Martin Sur',
    number: '2875',
    department: 'Godoy Cruz',
    placeSlug: 'cinemark-mendoza-palmares-godoy-cruz',
  },
];

const OBSERVATION_HOURS = 30;

/**
 * The complex's position as the chain itself publishes it: the coordinate
 * authored in its own location link on /cines (publisher evidence, the same
 * rule as business-authored JSON-LD in SOURCES.md; no provider geocoding).
 */
async function publisherPoint(
  fetcher: PoliteFetcher,
  source: CinemaSource,
): Promise<{ latitude: number; longitude: number; ref: string } | null> {
  const url = `${CINEMARK_ORIGIN}/cines`;
  const page = await fetcher.get(url);
  if (!page.ok) return null;
  const html = page.body.toString('utf8');
  const text = flightText(html) + html;
  const start = text.indexOf(`{"id":${source.chainId},`);
  if (start < 0) return null;
  const cinema = objectAt(text, start) as { googleMapsUrl?: string } | null;
  const match = /!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/.exec(
    cinema?.googleMapsUrl ?? '',
  );
  if (!match) return null;
  const latitude = Number(match[2]);
  const longitude = Number(match[1]);
  // Inside the Gran Mendoza area, or it is not this complex.
  if (
    latitude < -33.2 ||
    latitude > -32.7 ||
    longitude < -69 ||
    longitude > -68.6
  )
    return null;
  return { latitude, longitude, ref: url };
}

export async function ensureCinemaPlace(
  dataSource: DataSource,
  source: CinemaSource,
  georef: GeorefClient,
  fetcher: PoliteFetcher = new PoliteFetcher(),
): Promise<number | null> {
  const [existing] = await dataSource.query<{ id: number }[]>(
    `SELECT id FROM place WHERE slug = $1 AND deleted_at IS NULL`,
    [source.placeSlug],
  );
  if (existing) return Number(existing.id);
  const point =
    (await georef.geocode(source.street, source.number, source.department)) ??
    (await publisherPoint(fetcher, source));
  if (!point) return null;
  // The department is Georef's reading of that point, not an assumption.
  const resolved = await georef.departmentAt(point.latitude, point.longitude);
  if (resolved) source = { ...source, department: resolved };
  const [department] = await dataSource.query<{ id: number }[]>(
    `SELECT id FROM department WHERE name = $1 AND deleted_at IS NULL`,
    [source.department],
  );
  if (!department) return null;
  const [row] = await dataSource.query<{ id: number }[]>(
    `INSERT INTO place (name, address, id_department, latitude, longitude, slug, status,
                        kind, discoverable, verified_at, coordinates_ref)
     VALUES ($1, $2, $3, $4, $5, $6, 'published', 'cinema', true, now(), $7)
     RETURNING id`,
    [
      source.name,
      `Av. ${source.street} ${source.number}, Shopping Palmares`,
      Number(department.id),
      point.latitude,
      point.longitude,
      source.placeSlug,
      point.ref.slice(0, 500),
    ],
  );
  await dataSource.query(
    `INSERT INTO place_source (id_place, kind, url, discovered_via, identity_status, identity_signals, last_status)
     VALUES ($1, 'OFFICIAL_SITE', $2, 'CURATOR', 'VERIFIED', '["official_chain_listing"]', 'ok')
     ON CONFLICT DO NOTHING`,
    [Number(row.id), `${CINEMARK_ORIGIN}/cartelera/${source.slug}`],
  );
  return Number(row.id);
}

export interface CinemaRefresh {
  cinema: string;
  status: string;
  screenings: number;
  withdrawn: number;
  days: string[];
}

export async function refreshCinemas(
  dataSource: DataSource,
  georef: GeorefClient,
  fetcher = new PoliteFetcher(),
  now = new Date(),
): Promise<CinemaRefresh[]> {
  const results: CinemaRefresh[] = [];
  for (const source of CINEMA_SOURCES) {
    const result: CinemaRefresh = {
      cinema: source.name,
      status: 'ok',
      screenings: 0,
      withdrawn: 0,
      days: [],
    };
    results.push(result);
    const placeId = await ensureCinemaPlace(
      dataSource,
      source,
      georef,
      fetcher,
    );
    if (!placeId) {
      result.status = 'no_verified_position';
      continue;
    }
    const listingUrl = `${CINEMARK_ORIGIN}/cartelera/${source.slug}`;
    const pricesUrl = `${CINEMARK_ORIGIN}/precios`;
    const [listing, prices] = await Promise.all([
      fetcher.get(listingUrl),
      fetcher.get(pricesUrl),
    ]);
    if (!listing.ok) {
      result.status = `listing_${listing.reason}`;
      continue;
    }
    const { screenings } = parseCartelera(listing.body.toString('utf8'));
    if (!screenings.length) {
      result.status = 'no_screenings_parsed';
      continue;
    }
    const tariffs = prices.ok
      ? parsePrices(prices.body.toString('utf8'), source.chainId)
      : [];
    const days = [...new Set(screenings.map((s) => s.startsAt.slice(0, 10)))];
    result.days = days;
    const observedUntil = new Date(
      now.getTime() + OBSERVATION_HOURS * 3600_000,
    );
    await dataSource.transaction(async (manager) => {
      for (const screening of screenings) {
        const startsAt = new Date(screening.startsAt);
        if (startsAt <= now) continue;
        const price = ticketPrice(
          tariffs,
          screening.format,
          screening.startsAt,
        );
        const expiresAt = startsAt < observedUntil ? startsAt : observedUntil;
        await manager.query(
          `INSERT INTO screening (id_place, movie_title, duration_minutes, starts_at, format,
                                  language, room, price_kind, price_min, price_source_ref,
                                  booking_url, source_url, observed_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id_place, movie_title, starts_at, room) WHERE deleted_at IS NULL
           DO UPDATE SET observed_at = EXCLUDED.observed_at, expires_at = EXCLUDED.expires_at,
                         price_kind = EXCLUDED.price_kind, price_min = EXCLUDED.price_min,
                         format = EXCLUDED.format, updated_at = now()`,
          [
            placeId,
            screening.movieTitle.slice(0, 200),
            screening.durationMinutes,
            startsAt,
            screening.format?.slice(0, 60) ?? null,
            screening.language,
            screening.room?.slice(0, 60) ?? null,
            price?.kind ?? 'UNKNOWN',
            price?.amount ?? null,
            price ? pricesUrl : null,
            screening.bookingUrl?.slice(0, 500) ?? null,
            listingUrl,
            now,
            expiresAt,
          ],
        );
        result.screenings += 1;
      }
      // What the official schedule no longer lists for these days is withdrawn.
      const withdrawn = await manager.query<{ id: number }[]>(
        `UPDATE screening SET deleted_at = now()
          WHERE id_place = $1 AND deleted_at IS NULL AND observed_at < $3
            AND (starts_at AT TIME ZONE 'America/Argentina/Mendoza')::date = ANY($2::date[])
          RETURNING id`,
        [placeId, days, now],
      );
      result.withdrawn = (
        Array.isArray(withdrawn[0]) ? withdrawn[0] : withdrawn
      ).length;
    });
  }
  return results;
}
