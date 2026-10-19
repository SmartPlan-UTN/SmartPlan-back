/**
 * Local time for planning. Mendoza (America/Argentina/Mendoza) is UTC-3 all
 * year with no daylight saving, so a fixed offset is exact and avoids pulling
 * a time-zone database into the planner.
 *
 * Planning time is expressed as minutes from the local midnight of the plan's
 * date. Values past 1440 mean "after midnight" of the same outing (a dinner
 * at 22:00 followed by drinks until 01:30 is 1320 → 1530).
 */
export const LOCAL_UTC_OFFSET_MINUTES = -180;

export interface LocalDateTime {
  /** YYYY-MM-DD in local time. */
  date: string;
  /** Minutes since local midnight, 0..1439. */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday, local. */
  weekday: number;
}

export function toLocal(instant: Date): LocalDateTime {
  const shifted = new Date(
    instant.getTime() + LOCAL_UTC_OFFSET_MINUTES * 60_000,
  );
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** The UTC instant of a local date + minutes (minutes may exceed 1440). */
export function fromLocal(date: string, minutes: number): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(
    Date.UTC(year, month - 1, day) +
      (minutes - LOCAL_UTC_OFFSET_MINUTES) * 60_000,
  );
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "21:30" for 1290; minutes past midnight wrap ("01:30" for 1530). */
export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const rest = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Parses "21", "21:30", "9.30" into minutes, or null. */
export function parseClock(text: string): number | null {
  const match = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 24 || minutes > 59) return null;
  return (hours % 24) * 60 + minutes;
}

/** Rounds up to the next quarter hour: plans start at human times. */
export function ceilToQuarter(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}
