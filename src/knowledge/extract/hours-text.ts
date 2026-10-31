/**
 * Opening hours written in Spanish prose on a venue's own page
 * ("Martes a domingo de 20 a 00 hs", "Lun a Vie 12–16 y 20–00", "Lunes
 * cerrado") turned into weekly intervals.
 *
 * It is deliberately strict: it only reads text that a page labels as its
 * hours (see `hoursBlocks`), every segment must name its days, and anything
 * open-ended ("desde las 20") or ambiguous makes that day unknown rather than
 * guessed. A menu's "almuerzo ejecutivo de lunes a viernes 12 a 16" is not
 * the venue's opening hours and is never read as such.
 */
import type { HoursInterval } from '../../planning-engine/hours/hours';

/** Index 0 = Sunday … 6 = Saturday; null = not stated. */
export type ParsedWeek = (HoursInterval[] | 'closed' | null)[];

export interface ParsedHours {
  week: ParsedWeek;
  /** Days stated (open or closed). */
  statedDays: number;
  /** The text segments that produced it (for provenance/debugging). */
  segments: string[];
}

const DAY_WORDS: [RegExp, number][] = [
  [/^(lunes|lun|lu)$/, 1],
  [/^(martes|mar|ma)$/, 2],
  [/^(miercoles|mie|mi|mier)$/, 3],
  [/^(jueves|jue|ju)$/, 4],
  [/^(viernes|vie|vi)$/, 5],
  [/^(sabados?|sab|sa)$/, 6],
  [/^(domingos?|dom|do)$/, 0],
];

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ');
}

function dayOf(word: string): number | null {
  for (const [pattern, day] of DAY_WORDS) if (pattern.test(word)) return day;
  return null;
}

/** Days from Monday-first order: lunes a domingo wraps correctly. */
function dayRange(from: number, to: number): number[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [];
  const days: number[] = [];
  for (let i = a; ; i = (i + 1) % 7) {
    days.push(order[i]);
    if (i === b) break;
    if (days.length > 7) return [];
  }
  return days;
}

const DAY_TOKEN =
  '(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|lun|mar|mie|mier|jue|vie|sab|dom)\\.?';
const DAY_SPEC = new RegExp(
  `^\\s*(?:de\\s+|los\\s+)?(todos\\s+los\\s+dias|${DAY_TOKEN}(?:\\s*(?:a|al|-|y|,)\\s*${DAY_TOKEN})*)`,
);

/** Days named at the start of a segment ("martes a sabado", "lun, mie y vie"). */
function parseDays(spec: string): number[] {
  if (/todos\s+los\s+dias/.test(spec)) return [0, 1, 2, 3, 4, 5, 6];
  const tokens = spec.replace(/\./g, '').match(/[a-z]+|-|,/g) ?? [];
  const days = new Set<number>();
  for (let index = 0; index < tokens.length; index += 1) {
    const day = dayOf(tokens[index].replace(/^de\s+|^los\s+/, ''));
    if (day === null) continue;
    const joiner = tokens[index + 1];
    const next = dayOf(tokens[index + 2] ?? '');
    if (
      (joiner === 'a' || joiner === 'al' || joiner === '-') &&
      next !== null
    ) {
      for (const d of dayRange(day, next)) days.add(d);
      index += 2;
    } else days.add(day);
  }
  return [...days];
}

/** "20", "20.30", "20:30", "20hs", "00", "1 am" → minutes. */
function clock(raw: string): number | null {
  const match =
    /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?|hrs?)?\.?\s*(am|pm)?$/.exec(
      raw.trim(),
    );
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (match[3] === 'pm' && hours < 12) hours += 12;
  if (match[3] === 'am' && hours === 12) hours = 0;
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const TIME = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:hs?|hrs?)?\\.?\\s*(?:am|pm)?';
const RANGE = new RegExp(
  `(?:de\\s+)?(${TIME})\\s*(?:a|-|hasta)\\s*(?:las\\s+)?(${TIME})`,
  'g',
);

/** Time ranges in the rest of a segment; null when something is open-ended. */
function parseRanges(rest: string): HoursInterval[] | null {
  if (/\bdesde\s+las?\s+\d/.test(rest) && !/hasta/.test(rest)) return null;
  const intervals: HoursInterval[] = [];
  for (const match of rest.matchAll(RANGE)) {
    const open = clock(match[1]);
    let close = clock(match[2]);
    if (open === null || close === null) return null;
    // Closing at or before opening crosses midnight (20 a 00, 21 a 2).
    if (close <= open) close += 1440;
    if (close - open > 20 * 60 || close - open < 30) return null;
    intervals.push([open, close]);
  }
  return intervals.length ? intervals : null;
}

/**
 * Parses an hours block. Returns null when nothing reliable is stated.
 * Days not named stay unknown (null) unless the block states a complete
 * schedule (≥4 named days), where the unnamed ones are closed, as a posted
 * schedule means.
 */
export function parseSpanishHours(block: string): ParsedHours | null {
  const text = normalizeText(block)
    .replace(/\bhorarios?\b\s*:?/g, '\n')
    .replace(/\b(y\s+feriados?|feriados?)\b/g, '');
  const week: ParsedWeek = [null, null, null, null, null, null, null];
  const segments: string[] = [];
  // A segment starts at each day expression.
  const pieces = text
    .split(/\n|;|\||•|·/)
    .flatMap((line) =>
      line.split(
        new RegExp(
          `(?<!(?:\\ba|\\bal|\\by|-|,)\\s*)(?=\\b(?:de\\s+)?(?:todos\\s+los\\s+dias|${DAY_TOKEN}(?:\\s*(?:a|al|-)\\s*${DAY_TOKEN})?)\\s*[:,(]?\\s*(?:de\\s+)?(?:\\d|cerrado))`,
        ),
      ),
    )
    .map((piece) => piece.trim())
    .filter(Boolean);
  for (const piece of pieces) {
    const spec = DAY_SPEC.exec(piece);
    if (!spec) continue;
    const days = parseDays(spec[1]);
    if (!days.length) continue;
    const rest = piece.slice(spec[0].length);
    if (/^\s*[:,(]?\s*cerrad[oa]/.test(rest)) {
      for (const day of days) week[day] = 'closed';
      segments.push(piece);
      continue;
    }
    const ranges = parseRanges(rest);
    if (!ranges) continue;
    for (const day of days) {
      const existing = week[day];
      week[day] = Array.isArray(existing) ? [...existing, ...ranges] : ranges;
    }
    segments.push(piece);
  }
  const named = week.filter((day) => day !== null).length;
  if (!named) return null;
  if (named >= 4) for (let d = 0; d < 7; d += 1) week[d] ??= 'closed';
  return {
    week,
    statedDays: week.filter((day) => day !== null).length,
    segments,
  };
}

/** Whether a short heading/label introduces a venue's opening hours. */
export function isHoursLabel(text: string): boolean {
  const normal = normalizeText(text);
  // A meal service ("menu ejecutivo", "almuerzo") is not the venue's hours.
  if (/menu|ejecutivo|promo|delivery|envios|reparto|take ?away/.test(normal))
    return false;
  return /\b(horarios?|abierto|abrimos|atencion|estamos abiertos|opening hours)\b/.test(
    normal,
  );
}
