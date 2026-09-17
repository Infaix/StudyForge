import { zonedDateKey, addDaysToDateKey, dateKeyDiff, safeTimeZone } from '@/lib/time';

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  totalStudyDays: number;
  daysSinceLastStudy: number;
}

export interface ComputeStreakOptions {
  timeZone?: string;
  /** Inject "now" for deterministic tests (defaults to the current instant). */
  now?: Date | number | string;
}

/**
 * Pure streak math over study-session rows (only `start_time` is read).
 *
 * Calendar days are resolved through the same `zonedDateKey` helper as the
 * canonical statistics, so a streak is counted in the USER's local calendar
 * (Australia/Sydney vs America/New_York vs UTC), not UTC. Today's boundary is
 * the local midnight, and DST transitions are handled by the Intl-based date
 * key resolution.
 *
 * Semantics preserved from the original implementation:
 * - totalStudyDays  = distinct local calendar dates with any session.
 * - currentStreak   = consecutive days ending today; if nothing today, the
 *                     run ending yesterday (the streak "safes" until the day
 *                     completes).
 * - longestStreak   = longest run of consecutive study dates.
 * - lastStudyDate   = most recent local date studied (YYYY-MM-DD).
 * - daysSinceLastStudy = calendar days between today and lastStudyDate.
 */
export function computeStreakInfo(
  rows: Array<{ start_time: string }>,
  opts: ComputeStreakOptions = {}
): StreakInfo {
  const timeZone = safeTimeZone(opts?.timeZone ?? 'UTC');
  const nowMs = opts?.now ? new Date(opts.now).getTime() : Date.now();
  const empty: StreakInfo = {
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    totalStudyDays: 0,
    daysSinceLastStudy: 9999,
  };

  if (!rows || rows.length === 0) return empty;

  const uniqueDates = new Set<string>();
  for (const session of rows) {
    const ms = new Date(session.start_time).getTime();
    if (Number.isNaN(ms)) continue;
    uniqueDates.add(zonedDateKey(ms, timeZone));
  }

  const dates = Array.from(uniqueDates).sort();
  const totalStudyDays = dates.length;
  if (totalStudyDays === 0) return empty;

  const lastStudyDate = dates[dates.length - 1];
  const todayKey = zonedDateKey(nowMs, timeZone);
  const present = new Set(dates);

  // Longest run of consecutive calendar days.
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = dateKeyDiff(dates[i], dates[i - 1]);
    if (diff === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else if (diff > 1) {
      run = 1;
    }
  }

  // Current streak walks backwards from today (falling back to yesterday when
  // today has no session yet).
  let cursor = present.has(todayKey) ? todayKey : addDaysToDateKey(todayKey, -1);
  let currentStreak = 0;
  while (present.has(cursor)) {
    currentStreak += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  let daysSinceLastStudy = dateKeyDiff(todayKey, lastStudyDate);
  if (daysSinceLastStudy < 0) daysSinceLastStudy = 0;

  return {
    currentStreak,
    longestStreak,
    lastStudyDate,
    totalStudyDays,
    daysSinceLastStudy,
  };
}