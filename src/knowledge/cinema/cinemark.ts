/**
 * Cinemark Argentina: the schedule and the current prices of a complex, from
 * the cinema's own public pages:
 * - /cartelera/{slug}: Schema.org MovieTheater with ScreeningEvent items
 *   (startDate, videoFormat, room, Movie name and duration);
 * - /precios: "Tarifas Vigentes" per complex, by room type, with the date
 *   they take effect.
 * robots.txt allows these pages (2026-10-17) and the terms do not restrict
 * reading public listings. Only factual fields are kept; nothing else.
 * Research: docs/knowledge/cinema-sources.md.
 */
import { normalizeText } from '../extract/hours-text';

export const CINEMARK_ORIGIN = 'https://www.cinemark.com.ar';

/** Text streamed by the page (Next.js flight chunks), unescaped. */
export function flightText(html: string): string {
  const parts: string[] = [];
  for (const match of html.matchAll(
    /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g,
  )) {
    try {
      parts.push(JSON.parse(`"${match[1]}"`) as string);
    } catch {
      /* skip malformed chunk */
    }
  }
  return parts.join('');
}

/** The balanced JSON object that starts at `start` in `text`. */
export function objectAt(text: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface ParsedScreening {
  movieTitle: string;
  durationMinutes: number;
  /** Local wall-clock start (Mendoza), ISO with -03:00. */
  startsAt: string;
  format: string | null;
  language: string | null;
  room: string | null;
  bookingUrl: string | null;
}

/** "PT1H46M" → 106. */
export function isoDurationMinutes(value: unknown): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
  );
  if (!match) return null;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return minutes > 0 ? minutes : null;
}

/**
 * Cinemark writes local times with a stray "Z" ("…T14:30:00.000Z-03:00"):
 * the wall clock is Mendoza's. Normalized to an explicit -03:00 instant.
 */
export function localStart(value: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
  );
  if (!match) return null;
  return `${match[1]}T${match[2]}:${match[3]}:00-03:00`;
}

function languageOf(format: string | null, title: string): string | null {
  const text = normalizeText(`${format ?? ''} ${title}`);
  if (/\bsubt|\bsub\b/.test(text)) return 'Subtitulada';
  if (/\bcast|doblad|espanol/.test(text)) return 'Castellano';
  return null;
}

export function parseCartelera(html: string): {
  theater: string | null;
  screenings: ParsedScreening[];
} {
  const text = flightText(html) + html;
  const marker = '{"@context":"https://schema.org","@type":"MovieTheater"';
  const start = text.indexOf(marker);
  if (start < 0) return { theater: null, screenings: [] };
  const theater = objectAt(text, start) as {
    name?: string;
    event?: Record<string, unknown>[];
  } | null;
  const screenings: ParsedScreening[] = [];
  for (const event of theater?.event ?? []) {
    const movie = event.workPresented as Record<string, unknown> | undefined;
    const title = typeof movie?.name === 'string' ? movie.name.trim() : '';
    const startsAt = localStart(event.startDate);
    const duration = isoDurationMinutes(movie?.duration);
    if (!title || !startsAt || !duration) continue;
    const format =
      typeof event.videoFormat === 'string' ? event.videoFormat.trim() : null;
    const location = event.location as Record<string, unknown> | undefined;
    const offers = event.offers as Record<string, unknown> | undefined;
    screenings.push({
      movieTitle: title,
      durationMinutes: duration,
      startsAt,
      format,
      language: languageOf(format, title),
      room: typeof location?.name === 'string' ? location.name : null,
      bookingUrl: typeof offers?.url === 'string' ? offers.url : null,
    });
  }
  return { theater: theater?.name ?? null, screenings };
}

export interface TicketTariff {
  effectiveFrom: string;
  /** Room type ("SALAS 2D", "SALAS COMFORT 3D (2)") → GENERAL price. */
  general: Record<string, number>;
  /** Room type → Monday–Wednesday price, with its validity end when stated. */
  midweek: Record<string, { price: number; until: string | null }>;
}

const amount = (value: unknown): number | null => {
  const digits = (
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  ).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
};

/** The complex's tariffs currently in force (and announced future ones). */
export function parsePrices(html: string, cinemaId: number): TicketTariff[] {
  const text = flightText(html) + html;
  const start = text.indexOf(`{"id":${cinemaId},`);
  if (start < 0) return [];
  const cinema = objectAt(text, start) as {
    prices?: {
      effectiveFrom?: string;
      experienceTypes?: {
        title?: string;
        prices?: { price?: string; description?: string }[];
      }[];
    }[];
  } | null;
  const tariffs: TicketTariff[] = [];
  for (const block of cinema?.prices ?? []) {
    if (!block.effectiveFrom) continue;
    const tariff: TicketTariff = {
      effectiveFrom: block.effectiveFrom,
      general: {},
      midweek: {},
    };
    for (const type of block.experienceTypes ?? []) {
      const title = normalizeText(type.title ?? '');
      for (const price of type.prices ?? []) {
        const value = amount(price.price);
        const description = normalizeText(price.description ?? '');
        if (!value) continue;
        if (description === 'general') tariff.general[title] = value;
        if (/lunes a miercoles/.test(description)) {
          const until = /hasta el (\d{2})\/(\d{2})\/(\d{2})/.exec(description);
          tariff.midweek[title] = {
            price: value,
            until: until ? `20${until[3]}-${until[2]}-${until[1]}` : null,
          };
        }
      }
    }
    tariffs.push(tariff);
  }
  return tariffs;
}

/**
 * The general ticket price of a screening, from its room format, weekday
 * and the tariff in force that day. XD has no published surcharge here:
 * its base price is a lower bound ("desde").
 */
export function ticketPrice(
  tariffs: TicketTariff[],
  format: string | null,
  startsAt: string,
): { kind: 'FIXED' | 'FROM'; amount: number } | null {
  const day = startsAt.slice(0, 10);
  const inForce = tariffs
    .filter((tariff) => tariff.effectiveFrom.slice(0, 10) <= day)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!inForce) return null;
  const f = normalizeText(format ?? '');
  const threeD = /\b3d\b/.test(f);
  const comfort = /comfort/.test(f);
  const key = Object.keys(inForce.general).find((title) => {
    if (comfort !== /comfort/.test(title)) return false;
    return threeD ? /3d/.test(title) : /2d/.test(title);
  });
  if (!key) return null;
  // Monday (1) to Wednesday (3), local date.
  const weekday = new Date(`${day}T12:00:00-03:00`).getUTCDay();
  const midweek = inForce.midweek[key];
  const value =
    midweek &&
    weekday >= 1 &&
    weekday <= 3 &&
    (!midweek.until || day <= midweek.until)
      ? midweek.price
      : inForce.general[key];
  return { kind: /\bxd\b/.test(f) ? 'FROM' : 'FIXED', amount: value };
}
