import { getDB } from '@/lib/db';
import { XP_CONFIG, getLevelFromXp, getStreakInfo } from './xp';
import {
  safeTimeZone,
  tzOffsetMs,
  zonedMidnightToUtcMs,
  zonedDateParts,
  zonedDateKey,
  zonedWeekday,
  getZonedDayBounds,
  type DayBounds,
} from '@/lib/time';

// Re-export the shared timezone helpers so existing callers importing them
// from '@/lib/server/study' keep working unchanged.
export {
  safeTimeZone,
  tzOffsetMs,
  zonedMidnightToUtcMs,
  zonedDateParts,
  zonedDateKey,
  zonedWeekday,
  getZonedDayBounds,
  type DayBounds,
};

export type StudyMode = 'stopwatch' | 'countdown' | 'pomodoro' | 'custom';

/** Smallest segment we will persist (filters out accidental double-clicks,
 * while still recording genuinely short study bursts — spec #12). */
export const MIN_SEGMENT_SECONDS = 5;

export interface SegmentInput {
  sessionId?: string;
  segmentId?: string;
  mode?: string;
  subjectId?: string | null;
  subjectName?: string | null;
  /** Stable per-browser id so cross-device merges stay distinguishable. */
  deviceId?: string | null;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  duration?: number;
  completed?: boolean;
}

export interface SubjectBreakdown {
  subjectId: string | null;
  subjectName: string | null;
  seconds: number;
}

export interface DayBucket {
  /** Local calendar date in the requesting timezone (YYYY-MM-DD). */
  date: string;
  seconds: number;
}

export interface StudyStats {
  totalStudySeconds: number;
  todayStudySeconds: number;
  weekStudySeconds: number;
  monthStudySeconds: number;
  studySessionCount: number;
  /** Segments explicitly marked completed (finished countdowns / pomodoro focus units). */
  completedSessionCount: number;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  streak: number;
  /** Extended breakdowns (populated by getUserStudyStats; safe to ignore). */
  bySubject?: SubjectBreakdown[];
  byDay?: DayBucket[];
  averageSessionSeconds?: number;
  longestStreak?: number;
  totalStudyDays?: number;
}

export interface SessionHistoryEntry {
  sessionId: string;
  mode: string;
  subjectId: string | null;
  subjectName: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  segmentCount: number;
  completed: boolean;
}

export interface RecordSegmentResult {
  success: true;
  duplicate: boolean;
  sessionId: string;
  segmentId: string;
  recordedSeconds: number;
  awardedXp: number;
  leveledUp: boolean;
  stats: StudyStats;
}

const VALID_MODES = new Set<StudyMode>(['stopwatch', 'countdown', 'pomodoro', 'custom']);

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function safeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Validate and normalize a study-segment submission.
 * Returns { ok: true, ...normalized } or { ok: false, error }.
 * The server never trusts client-supplied XP or userId.
 */
export function validateSegmentInput(body: SegmentInput): { ok: true; value: {
  segmentId: string;
  sessionId: string;
  mode: StudyMode;
  subjectId: string | null;
  deviceId: string | null;
  subjectName: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completed: boolean;
} } | { ok: false; error: string } {
  const durationSeconds = toInt(body.durationSeconds ?? body.duration);
  if (durationSeconds === null || durationSeconds <= 0) {
    return { ok: false, error: 'Valid durationSeconds is required' };
  }
  if (durationSeconds < MIN_SEGMENT_SECONDS) {
    return { ok: false, error: `Segment too short (minimum ${MIN_SEGMENT_SECONDS}s)` };
  }
  if (durationSeconds > XP_CONFIG.maxDurationSeconds) {
    return { ok: false, error: `Segment too long (maximum ${XP_CONFIG.maxDurationSeconds / 3600}h)` };
  }

  const rawSegmentId = typeof body.segmentId === 'string' ? body.segmentId.trim() : '';
  const rawSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const segmentId = (rawSegmentId || rawSessionId).slice(0, 128);
  if (!segmentId) {
    return { ok: false, error: 'segmentId is required for idempotent submission' };
  }
  if (!/^[\w:#.\-]+$/.test(segmentId)) {
    return { ok: false, error: 'Invalid segmentId format' };
  }

  const mode = VALID_MODES.has(body.mode as StudyMode) ? (body.mode as StudyMode) : 'custom';

  // Timestamps: reject impossible values. If absent/unparseable, reconstruct
  // from the validated duration ending "now".
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let startedAt = safeDate(body.startedAt);
  let endedAt = safeDate(body.endedAt);
  if (!startedAt && !endedAt) {
    endedAt = nowIso;
    startedAt = new Date(nowMs - durationSeconds * 1000).toISOString();
  } else if (!endedAt) {
    endedAt = new Date(new Date(startedAt as string).getTime() + durationSeconds * 1000).toISOString();
  } else if (!startedAt) {
    startedAt = new Date(new Date(endedAt as string).getTime() - durationSeconds * 1000).toISOString();
  }
  const startMs = new Date(startedAt as string).getTime();
  const endMs = new Date(endedAt as string).getTime();
  if (endMs - startMs > durationSeconds * 1000 + 5 * 60 * 1000) {
    // Span much larger than claimed active time implies paused wall-clock time;
    // trust the active duration and anchor the end at "now".
    endedAt = nowIso;
    startedAt = new Date(Date.now() - durationSeconds * 1000).toISOString();
  }
  if (startMs > Date.now() + 5 * 60 * 1000) {
    return { ok: false, error: 'startedAt cannot be in the future' };
  }

  const subjectId =
    typeof body.subjectId === 'string' && body.subjectId.trim() !== '' ? body.subjectId.trim().slice(0, 128) : null;

  const deviceId =
    typeof body.deviceId === 'string' && body.deviceId.trim() !== '' ? body.deviceId.trim().slice(0, 128) : null;

  return {
    ok: true,
    value: {
      segmentId,
      sessionId: (rawSessionId || rawSegmentId).slice(0, 128),
      mode,
      subjectId,
      deviceId,
      subjectName:
        typeof body.subjectName === 'string' && body.subjectName.trim() !== ''
          ? body.subjectName.trim().slice(0, 120)
          : null,
      startedAt: startedAt as string,
      endedAt: endedAt as string,
      durationSeconds,
      completed: body.completed === true,
    },
  };
}

/** Effective seconds of a row, preferring exact seconds over legacy minutes. */
const EFFECTIVE_SECONDS_SQL = 'COALESCE(ss.duration_seconds, ss.duration * 60)';

/** Grouping key for one logical timer run. New rows store session_id
 * directly; older rows fall back to the `{session}#...` segment convention. */
export function sessionGroupKey(row: { session_id?: string | null; segment_id?: string | null; id: string }): string {
  if (row.session_id) return row.session_id;
  const seg = row.segment_id ?? '';
  const hash = seg.indexOf('#');
  if (hash > 0) return seg.slice(0, hash);
  return row.id;
}

// ---------------------------------------------------------------------------
// Timezone-aware calendar boundaries.
//
// start_time values are UTC ISO strings. "Today" must follow the user's
// local calendar day, not UTC. All helpers live in @/lib/time (client-safe)
// and are resolved back to a UTC instant using Intl, with an iterative offset
// fix-up so DST transitions stay correct. See src/lib/time.ts.
// ---------------------------------------------------------------------------

/**
 * Authoritative aggregate statistics for a user, derived from study_sessions.
 * Day/week/month follow the caller's timezone calendar (Monday-start weeks);
 * pass the client's IANA name (e.g. Australia/Melbourne) for correct daily
 * boundaries instead of UTC grouping.
 */
export async function getUserStudyStats(userId: string, opts?: { timeZone?: string }): Promise<StudyStats> {
  const db = getDB();
  const nowMs = Date.now();
  const { todayStartIso, weekStartIso, monthStartIso } = getZonedDayBounds(nowMs, opts?.timeZone ?? 'UTC');

  const agg = await db.prepare(`
    SELECT
      COALESCE(SUM(${EFFECTIVE_SECONDS_SQL}), 0) AS total_seconds,
      COALESCE(SUM(CASE WHEN ss.start_time >= ?1 THEN ${EFFECTIVE_SECONDS_SQL} ELSE 0 END), 0) AS today_seconds,
      COALESCE(SUM(CASE WHEN ss.start_time >= ?2 THEN ${EFFECTIVE_SECONDS_SQL} ELSE 0 END), 0) AS week_seconds,
      COALESCE(SUM(CASE WHEN ss.start_time >= ?3 THEN ${EFFECTIVE_SECONDS_SQL} ELSE 0 END), 0) AS month_seconds,
      COUNT(*) AS session_count,
      COALESCE(SUM(CASE WHEN ss.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_session_count
    FROM study_sessions ss WHERE ss.user_id = ?4
  `)
    .bind(todayStartIso, weekStartIso, monthStartIso, userId)
    .first<{
      total_seconds: number;
      today_seconds: number;
      week_seconds: number;
      month_seconds: number;
      session_count: number;
      completed_session_count: number;
    }>();

  const profile = await db.prepare(
    'SELECT xp, level, streak FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first<{ xp: number; level: number; streak: number }>();

  const totalXp = profile?.xp ?? 0;
  const level = getLevelFromXp(totalXp);
  const xpForNextLevel = Math.max(100, 100 * level);
  const xpIntoLevel = totalXp - xpRequiredForLevel(level);

  // Extended breakdowns for statistics/history views. Each query is scoped
  // to the user and covered by the 0003 indexes; failures degrade to empty
  // breakdowns rather than failing the whole stats read.
  const timeZone = safeTimeZone(opts?.timeZone ?? 'UTC');
  let bySubject: SubjectBreakdown[] = [];
  let byDay: DayBucket[] = [];
  let averageSessionSeconds = 0;
  let longestStreak = 0;
  let totalStudyDays = 0;
  try {
    const subjRows = await db.prepare(`
      SELECT ss.subject_id AS subject_id, s.name AS subject_name,
             COALESCE(SUM(${EFFECTIVE_SECONDS_SQL}), 0) AS seconds
      FROM study_sessions ss LEFT JOIN subjects s ON s.id = ss.subject_id
      WHERE ss.user_id = ? GROUP BY ss.subject_id ORDER BY seconds DESC
    `).bind(userId).all<{ subject_id: string | null; subject_name: string | null; seconds: number }>();
    bySubject = (subjRows.results ?? []).map((r) => ({
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      seconds: r.seconds ?? 0,
    }));

    const dayRows = await db.prepare(`
      SELECT ss.start_time AS start_time, ${EFFECTIVE_SECONDS_SQL} AS seconds
      FROM study_sessions ss WHERE ss.user_id = ? AND ss.start_time >= ?
      ORDER BY ss.start_time ASC
    `).bind(userId, new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString())
      .all<{ start_time: string; seconds: number }>();
    const dayMap = new Map<string, number>();
    for (const r of dayRows.results ?? []) {
      const ms = new Date(r.start_time).getTime();
      if (Number.isNaN(ms)) continue;
      const key = zonedDateKey(ms, timeZone);
      dayMap.set(key, (dayMap.get(key) ?? 0) + (r.seconds ?? 0));
    }
    byDay = [...dayMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, seconds]) => ({ date, seconds }));

    const sessRows = await db.prepare(`
      SELECT ss.session_id AS session_id, ss.segment_id AS segment_id, ss.id AS id,
             COALESCE(ss.duration_seconds, ss.duration * 60) AS seconds
      FROM study_sessions ss WHERE ss.user_id = ?
    `).bind(userId).all<{ session_id: string | null; segment_id: string | null; id: string; seconds: number }>();
    const sessMap = new Map<string, number>();
    for (const r of sessRows.results ?? []) {
      const key = sessionGroupKey(r);
      sessMap.set(key, (sessMap.get(key) ?? 0) + (r.seconds ?? 0));
    }
    if (sessMap.size > 0) {
      averageSessionSeconds = Math.round([...sessMap.values()].reduce((a, b) => a + b, 0) / sessMap.size);
    }

    const streakInfo = await getStreakInfo(userId);
    longestStreak = streakInfo.longestStreak;
    totalStudyDays = streakInfo.totalStudyDays;
  } catch {
    // Breakdowns are best-effort; core totals above remain authoritative.
  }

  return {
    totalStudySeconds: agg?.total_seconds ?? 0,
    todayStudySeconds: agg?.today_seconds ?? 0,
    weekStudySeconds: agg?.week_seconds ?? 0,
    monthStudySeconds: agg?.month_seconds ?? 0,
    studySessionCount: agg?.session_count ?? 0,
    completedSessionCount: agg?.completed_session_count ?? 0,
    totalXp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    progressPercent: Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100)),
    streak: profile?.streak ?? 0,
    bySubject,
    byDay,
    averageSessionSeconds,
    longestStreak,
    totalStudyDays,
  };
}

function xpRequiredForLevel(level: number): number {
  // Mirrors getLevelFromXp: cumulative XP needed to reach `level`.
  let total = 0;
  for (let l = 1; l < level; l++) total += 100 * l;
  return total;
}

interface ProfileXpState {
  xp: number;
  level: number;
  minutesTotal: number;
  carrySeconds: number;
}

/**
 * Server-side XP calculation with sub-minute carry-over.
 *
 * Base rule (existing): 1 XP per completed minute + 1 bonus XP per lifetime
 * 30-minute mark reached. Segments arrive in chunks (pause/resume), so the
 * bonus is computed from the lifetime minute total to stay monotonic, and the
 * sub-minute remainder is carried into the next segment so no studied time
 * is lost to rounding.
 */
export function computeSegmentXp(state: ProfileXpState, durationSeconds: number): {
  awardedXp: number;
  newMinutesTotal: number;
  newCarrySeconds: number;
} {
  const effective = state.carrySeconds + durationSeconds;
  const mins = Math.floor(effective / 60);
  const newCarrySeconds = effective % 60;
  const newMinutesTotal = state.minutesTotal + mins;
  const bonusBefore = Math.floor(state.minutesTotal / 30);
  const bonusAfter = Math.floor(newMinutesTotal / 30);
  return {
    awardedXp: mins + (bonusAfter - bonusBefore),
    newMinutesTotal,
    newCarrySeconds,
  };
}

/**
 * Record one study segment for an authenticated user.
 *
 * Pipeline: validate → INSERT OR IGNORE (UNIQUE segment_id) → on first insert:
 * aggregate stats → server-side XP → update user_profiles → optional social
 * activity. Duplicate submissions are no-ops that still return authoritative
 * state so clients can reconcile.
 */
export async function recordStudySegment(
  userId: string,
  input: SegmentInput
): Promise<RecordSegmentResult | { success: false; error: string }> {
  const parsed = validateSegmentInput(input);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const seg = parsed.value;

  const db = getDB();

  // Validate subject ownership: a submitted subjectId must belong to this user.
  let subjectId: string | null = null;
  if (seg.subjectId) {
    const owned = await db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
      .bind(seg.subjectId, userId).first<{ id: string }>();
    subjectId = owned ? seg.subjectId : null;
  }

  const notes = seg.subjectName && !subjectId ? `subject:${seg.subjectName}` : null;
  const nowIso = new Date().toISOString();

  // Idempotency: UNIQUE index on segment_id makes retries and double-clicks
  // single-count. INSERT OR IGNORE + meta.changes is race-safe.
  // session_id/device_id columns come from migration 0003; older databases
  // without them fall back to the legacy column list so reads never break.
  let insertResult;
  try {
    insertResult = await db.prepare(`
      INSERT OR IGNORE INTO study_sessions
        (id, user_id, subject_id, topic_id, duration, start_time, end_time, notes,
         duration_seconds, segment_id, session_id, device_id, mode, completed, created_at)
      VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    `)
      .bind(
        crypto.randomUUID(),
        userId,
        subjectId,
        Math.floor(seg.durationSeconds / 60), // legacy minute column kept in sync
        seg.startedAt,
        seg.endedAt,
        notes,
        seg.durationSeconds,
        seg.segmentId,
        seg.sessionId,
        seg.deviceId,
        seg.mode,
        seg.completed ? 1 : 0,
        nowIso
      )
      .run();
  } catch {
    insertResult = await db.prepare(`
      INSERT OR IGNORE INTO study_sessions
        (id, user_id, subject_id, topic_id, duration, start_time, end_time, notes,
         duration_seconds, segment_id, mode, completed, created_at)
      VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    `)
      .bind(
        crypto.randomUUID(),
        userId,
        subjectId,
        Math.floor(seg.durationSeconds / 60), // legacy minute column kept in sync
        seg.startedAt,
        seg.endedAt,
        notes,
        seg.durationSeconds,
        seg.segmentId,
        seg.mode,
        seg.completed ? 1 : 0,
        nowIso
      )
      .run();
  }

  const inserted = (insertResult.meta?.changes ?? 0) > 0;

  if (!inserted) {
    // Duplicate submission: count nothing, return current authoritative state.
    return {
      success: true,
      duplicate: true,
      sessionId: seg.sessionId,
      segmentId: seg.segmentId,
      recordedSeconds: 0,
      awardedXp: 0,
      leveledUp: false,
      stats: await getUserStudyStats(userId),
    };
  }

  // First insert: derive aggregates and award XP atomically enough for D1's
  // single-statement semantics (profile row updated once per accepted segment).
  const profileRow = await db.prepare(
    'SELECT xp, level, xp_minutes_total, xp_carry_seconds FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first<{ xp: number; level: number; xp_minutes_total: number; xp_carry_seconds: number }>();

  const prevXp = profileRow?.xp ?? 0;
  const prevLevel = getLevelFromXp(prevXp);
  const xpState: ProfileXpState = {
    xp: prevXp,
    level: prevLevel,
    minutesTotal: profileRow?.xp_minutes_total ?? 0,
    carrySeconds: profileRow?.xp_carry_seconds ?? 0,
  };

  const { awardedXp, newMinutesTotal, newCarrySeconds } = computeSegmentXp(xpState, seg.durationSeconds);
  const newXp = prevXp + awardedXp;
  const newLevel = getLevelFromXp(newXp);
  const leveledUp = newLevel > prevLevel;

  // Aggregates are read AFTER the segment insert so they already include
  // this session's seconds; only the profile-derived fields (xp/level/
  // streak) are still pre-update here.
  const stats = await getUserStudyStats(userId);
  const streakInfo = await getStreakInfo(userId);

  await db.prepare(`
    UPDATE user_profiles SET
      xp = ?1, level = ?2,
      study_time_today = ?3,
      study_time_this_week = ?4,
      study_time_this_month = ?5,
      study_time_all_time = ?6,
      xp_minutes_total = ?7,
      xp_carry_seconds = ?8,
      streak = ?9,
      updated_at = ?10
    WHERE user_id = ?11
  `)
    .bind(
      newXp,
      newLevel,
      Math.floor(stats.todayStudySeconds / 60),
      Math.floor(stats.weekStudySeconds / 60),
      Math.floor(stats.monthStudySeconds / 60),
      Math.floor(stats.totalStudySeconds / 60),
      newMinutesTotal,
      newCarrySeconds,
      streakInfo.currentStreak,
      nowIso,
      userId
    )
    .run();

  // The response payload must be authoritative (clients apply it verbatim):
  // override the profile-derived fields with the exact values just written
  // instead of issuing a second aggregate round-trip. Session counters
  // (totalStudySeconds etc.) are unaffected by the profile update.
  const xpForNextLevel = Math.max(100, 100 * newLevel);
  const xpIntoLevel = newXp - xpRequiredForLevel(newLevel);
  const finalStats: StudyStats = {
    ...stats,
    totalXp: newXp,
    level: newLevel,
    xpIntoLevel,
    xpForNextLevel,
    progressPercent: Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100)),
    streak: streakInfo.currentStreak,
  };

  // Social activity only for meaningful completions, not every pause.
  if (seg.completed) {
    const minutes = Math.max(1, Math.floor(seg.durationSeconds / 60));
    await db.prepare(`
      INSERT INTO study_activities (id, user_id, type, title, description, duration_minutes, xp_awarded, subject_id, metadata, created_at)
      VALUES (?1, ?2, 'study_session', ?3, ?4, ?5, ?6, ?7, '{}', ?8)
    `)
      .bind(
        crypto.randomUUID(),
        userId,
        seg.subjectName ? `Studied ${seg.subjectName}` : 'Completed a study session',
        `Completed a ${minutes}-minute ${seg.mode} session`,
        minutes,
        awardedXp,
        subjectId,
        nowIso
      )
      .run()
      .catch(() => undefined);
  }

  return {
    success: true,
    duplicate: false,
    sessionId: seg.sessionId,
    segmentId: seg.segmentId,
    recordedSeconds: seg.durationSeconds,
    awardedXp,
    leveledUp,
    stats: finalStats,
  };
}

/**
 * Grouped study-session history: checkpoint segments that share one
 * `studySessionId` collapse into a single understandable entry (never twenty
 * separate 20-second rows). Grouping prefers the stored session_id column
 * and falls back to the `{session}#...` segment convention for older rows.
 */
export async function getStudySessionHistory(
  userId: string,
  opts?: { limit?: number }
): Promise<SessionHistoryEntry[]> {
  const db = getDB();
  const limit = Math.max(1, Math.min(100, opts?.limit ?? 20));
  // Pull recent segments; grouping happens in JS so legacy + new rows mix.
  const { results } = await db.prepare(`
    SELECT ss.id AS id, ss.session_id AS session_id, ss.segment_id AS segment_id,
           ss.subject_id AS subject_id, s.name AS subject_name,
           ss.mode AS mode, ss.start_time AS start_time, ss.end_time AS end_time,
           COALESCE(ss.duration_seconds, ss.duration * 60) AS seconds,
           ss.completed AS completed
    FROM study_sessions ss LEFT JOIN subjects s ON s.id = ss.subject_id
    WHERE ss.user_id = ? ORDER BY ss.start_time DESC LIMIT 500
  `).bind(userId).all<{
    id: string;
    session_id: string | null;
    segment_id: string | null;
    subject_id: string | null;
    subject_name: string | null;
    mode: string | null;
    start_time: string;
    end_time: string;
    seconds: number;
    completed: number | null;
  }>().catch(() => ({ results: [] as never[] }));

  const groups = new Map<string, SessionHistoryEntry & { modes: Map<string, number> }>();
  for (const r of results ?? []) {
    const key = sessionGroupKey(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        sessionId: key,
        mode: r.mode ?? 'custom',
        subjectId: r.subject_id,
        subjectName: r.subject_name,
        startedAt: r.start_time,
        endedAt: r.end_time,
        durationSeconds: 0,
        segmentCount: 0,
        completed: false,
        modes: new Map(),
      };
      groups.set(key, g);
    }
    g.durationSeconds += r.seconds ?? 0;
    g.segmentCount += 1;
    if (r.start_time < g.startedAt) g.startedAt = r.start_time;
    if (r.end_time > g.endedAt) g.endedAt = r.end_time;
    if (r.completed === 1) g.completed = true;
    if (!g.subjectName && r.subject_name) {
      g.subjectName = r.subject_name;
      g.subjectId = r.subject_id;
    }
    if (r.mode) g.modes.set(r.mode, (g.modes.get(r.mode) ?? 0) + 1);
  }

  return [...groups.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit)
    .map((g) => {
      // Dominant mode wins when a session spans modes (e.g. mode switch).
      let mode = g.mode;
      let best = 0;
      for (const [m, n] of g.modes) {
        if (n > best) {
          best = n;
          mode = m;
        }
      }
      return {
        sessionId: g.sessionId,
        mode,
        subjectId: g.subjectId,
        subjectName: g.subjectName,
        startedAt: g.startedAt,
        endedAt: g.endedAt,
        durationSeconds: g.durationSeconds,
        segmentCount: g.segmentCount,
        completed: g.completed,
      };
    });
}

/**
 * Minimal cross-device conflict detection: if segments from a DIFFERENT
 * deviceId landed within the recent window, another StudyForge session is
 * (or was just) active on this account. Historical segments still merge
 * normally (independent IDs) — this only drives a non-destructive warning.
 */
export async function getCrossDeviceWarning(
  userId: string,
  deviceId: string | null,
  windowMinutes = 10
): Promise<{ active: boolean; otherDevices: number; windowMinutes: number }> {
  const db = getDB();
  const sinceIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  try {
    const { results } = await db.prepare(`
      SELECT DISTINCT ss.device_id AS device_id FROM study_sessions ss
      WHERE ss.user_id = ? AND ss.start_time >= ?
    `).bind(userId, sinceIso).all<{ device_id: string | null }>();
    const others = new Set(
      (results ?? []).map((r) => r.device_id).filter((d) => d && d !== deviceId)
    );
    return { active: others.size > 0, otherDevices: others.size, windowMinutes };
  } catch {
    // device_id column predates migration 0003 on some databases.
    return { active: false, otherDevices: 0, windowMinutes };
  }
}
