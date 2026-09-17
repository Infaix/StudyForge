/**
 * Client-safe timezone-aware calendar helpers.
 *
 * Shared by the canonical study stats pipeline, streak math, goal progress
 * and history grouping so every "week"/"today" boundary follows the exact
 * same Monday-start, local-midnight rules. Purely functional — no D1/worker
 * imports — so it can be used (and unit-tested) on both server and client.
 */

export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export function tzOffsetMs(timeZone: string, ms: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const asUTC = Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    parseInt(get('hour'), 10) % 24,
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10)
  );
  return asUTC - ms;
}

/** UTC instant of a local-calendar midnight in `timeZone`. */
export function zonedMidnightToUtcMs(y: number, m: number, d: number, timeZone: string): number {
  const tz = safeTimeZone(timeZone);
  const wallAsUTC = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Fixed-point iteration: ms + offset(ms) == wallAsUTC. Two passes are
  // enough even across DST transitions.
  let ms = wallAsUTC;
  for (let i = 0; i < 2; i++) ms = wallAsUTC - tzOffsetMs(tz, ms);
  return ms;
}

export function zonedDateParts(ms: number, timeZone: string): { y: number; m: number; d: number } {
  const tz = safeTimeZone(timeZone);
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = dtf.format(new Date(ms)).split('-').map((n) => parseInt(n, 10));
  return { y, m, d };
}

/** Local YYYY-MM-DD for an instant in `timeZone`. */
export function zonedDateKey(ms: number, timeZone: string): string {
  const tz = safeTimeZone(timeZone);
  const { y, m, d } = zonedDateParts(ms, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function zonedWeekday(ms: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: safeTimeZone(timeZone), weekday: 'short' });
  const day = dtf.format(new Date(ms));
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[day] ?? 1;
}

export interface DayBounds {
  todayStartIso: string;
  weekStartIso: string;
  monthStartIso: string;
}

/** Calendar day/week(Mon)/month starts in the user's timezone, as UTC ISOs. */
export function getZonedDayBounds(nowMs: number, timeZone: string): DayBounds {
  const tz = safeTimeZone(timeZone);
  const { y, m, d } = zonedDateParts(nowMs, tz);
  const todayStart = zonedMidnightToUtcMs(y, m, d, tz);
  const weekday = zonedWeekday(nowMs, tz);
  const weekStart = todayStart - (weekday - 1) * 24 * 60 * 60 * 1000;
  const monthStart = zonedMidnightToUtcMs(y, m, 1, tz);
  return {
    todayStartIso: new Date(todayStart).toISOString(),
    weekStartIso: new Date(weekStart).toISOString(),
    monthStartIso: new Date(monthStart).toISOString(),
  };
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local `YYYY-MM-DD` keys are pure dates: +N/-N days is unambiguous. */
export function addDaysToDateKey(key: string, days: number): string {
  const m = DATE_KEY_RE.exec(key);
  if (!m) return key;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from `fromKey` to `toKey` (positive when to > from). */
export function dateKeyDiff(toKey: string, fromKey: string): number {
  const parse = (k: string) => {
    const m = DATE_KEY_RE.exec(k);
    return m ? Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : 0;
  };
  return Math.round((parse(toKey) - parse(fromKey)) / (24 * 60 * 60 * 1000));
}