/**
 * Opening hours and their evaluation against a stop's time on the plan.
 *
 * Feasibility rules (D3, hybrid hours):
 * - confirmed closed at arrival → hard reject;
 * - confirmed open (recent durable hours or live verification) → eligible;
 * - unknown hours → never claimed open. The kind's typical window only says
 *   whether the time is *plausible*; a plausible stop is UNCERTAIN (ranked
 *   below verified alternatives and labelled "Horario sin confirmar"), an
 *   implausible one is rejected (a café at 23:30 is not a plan).
 */
import type { PlaceKind } from '../../catalog/taxonomy';
import { isPlaceKind } from '../../catalog/taxonomy';

/** [open, close) in minutes from that weekday's local midnight; close may exceed 1440. */
export type HoursInterval = readonly [number, number];

/** Index 0 = Sunday … 6 = Saturday. An empty day means closed that day. */
export type WeeklyHours = readonly (readonly HoursInterval[])[];

export type HoursStatus =
  | { status: 'OPEN'; closesAt: number }
  | { status: 'CLOSES_DURING'; closesAt: number }
  | { status: 'CLOSED'; opensAt: number | null };

/**
 * Evaluates a stop [start, end) — minutes from the plan date's midnight, end
 * may pass 1440 — against weekly hours. An interval of the previous day that
 * crosses midnight (Friday 20:00–02:00) also covers the early hours.
 */
export function evaluateHours(
  weekly: WeeklyHours,
  weekday: number,
  start: number,
  end: number,
): HoursStatus {
  const shifted: [number, number][] = [];
  for (const offset of [-1, 0, 1]) {
    const day = (((weekday + offset) % 7) + 7) % 7;
    for (const [open, close] of weekly[day] ?? []) {
      shifted.push([open + offset * 1440, close + offset * 1440]);
    }
  }
  const containing = shifted.find(
    ([open, close]) => start >= open && start < close,
  );
  if (containing) {
    return end <= containing[1]
      ? { status: 'OPEN', closesAt: containing[1] }
      : { status: 'CLOSES_DURING', closesAt: containing[1] };
  }
  const later = shifted
    .filter(([open]) => open > start)
    .sort((a, b) => a[0] - b[0])[0];
  return { status: 'CLOSED', opensAt: later ? later[0] : null };
}

const every = (intervals: HoursInterval[]): WeeklyHours =>
  [0, 1, 2, 3, 4, 5, 6].map(() => intervals);

/**
 * Typical windows by kind in Mendoza. Used ONLY to judge whether a time is
 * plausible when the venue's hours are unknown; never shown as its hours.
 */
const TYPICAL_WINDOWS: Partial<Record<PlaceKind, WeeklyHours>> = {
  restaurant: every([
    [12 * 60, 16 * 60],
    [20 * 60, 24 * 60 + 30],
  ]),
  cafe: every([[8 * 60, 21 * 60]]),
  bakery: every([[7 * 60, 20 * 60 + 30]]),
  ice_cream: every([[12 * 60, 25 * 60]]),
  bar: every([[19 * 60, 28 * 60]]),
  brewery: every([[18 * 60, 27 * 60]]),
  nightclub: every([[25 * 60, 29 * 60]]),
  market: every([[9 * 60, 21 * 60]]),
  shopping_center: every([[10 * 60, 22 * 60]]),
  museum: every([[9 * 60, 19 * 60]]),
  cultural_center: every([[10 * 60, 21 * 60]]),
  heritage: every([[9 * 60, 19 * 60]]),
  memorial: every([[7 * 60, 21 * 60 + 30]]),
  plaza: every([[7 * 60, 21 * 60 + 30]]),
  park: every([[7 * 60, 21 * 60]]),
  viewpoint: every([[8 * 60, 20 * 60 + 30]]),
  nature_reserve: every([[9 * 60, 18 * 60]]),
  natural_monument: every([[9 * 60, 18 * 60]]),
  reservoir: every([[9 * 60, 19 * 60]]),
  canyon: every([[9 * 60, 18 * 60]]),
  zoo: every([[10 * 60, 18 * 60]]),
  amusement: every([[10 * 60, 20 * 60]]),
};

/** Whether a stop at this time is plausible for its kind (unknown hours). */
export function plausibleForKind(
  kind: string | null,
  weekday: number,
  start: number,
  end: number,
): boolean | null {
  if (!isPlaceKind(kind)) return null;
  const window = TYPICAL_WINDOWS[kind];
  if (!window) return null;
  const status = evaluateHours(window, weekday, start, end);
  // A stop may run a little past a typical close (a dinner ending 00:45).
  return (
    status.status === 'OPEN' ||
    (status.status === 'CLOSES_DURING' && end - status.closesAt <= 30)
  );
}

/** Spanish clock of a closing time for copy ("cierra 23:30"). */
export function describeClose(closesAt: number): string {
  const wrapped = ((closesAt % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
