import { getDB } from '@/lib/db';
import { XP_CONFIG, getLevelFromXp, getStreakInfo } from './xp';

export type StudyMode = 'stopwatch' | 'countdown' | 'pomodoro' | 'custom';

/** Smallest segment we will persist (filters out accidental double-clicks). */
export const MIN_SEGMENT_SECONDS = 15;

export interface SegmentInput {
  sessionId?: string;
  segmentId?: string;
  mode?: string;
  subjectId?: string | null;
  subjectName?: string | null;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  duration?: number;
  completed?: boolean;
}

export interface StudyStats {
  totalStudySeconds: number;
  todayStudySeconds: number;
  weekStudySeconds: number;
  monthStudySeconds: number;
  studySessionCount: number;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  streak: number;
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
  if (!/^[\w:.\-]+$/.test(segmentId)) {
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

  return {
    ok: true,
    value: {
      segmentId,
      sessionId: (rawSessionId || rawSegmentId).slice(0, 128),
      mode,
      subjectId,
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

/**
 * Authoritative aggregate statistics for a user, derived from study_sessions.
 */
export async function getUserStudyStats(userId: string): Promise<StudyStats> {
  const db = getDB();
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const todayStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const weekStartIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStartIso = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();

  const agg = await db.prepare(`
    SELECT
      COALESCE(SUM(${EFFECTIVE_SECONDS_SQL}), 0) AS total_seconds,
      COALESCE(SUM(CASE WHEN ss.start_time >= ?1 THEN ${EFFECTIVE_SECONDS_SQL} ELSE 0 END), 0) AS today_seconds,
      COALESCE(SUM(CASE WHEN ss.start_time >= ?2 THEN ${EFFECTIVE_SECONDS_SQL} ELSE 0 END), 0) AS week_seconds,
      COALESCE(SUM(CASE WHEN ss.start_time >= ?3 THEN ${EFFECTIVE_SECONDS_SQL} ELSE 0 END), 0) AS month_seconds,
      COUNT(*) AS session_count
    FROM study_sessions ss WHERE ss.user_id = ?4
  `)
    .bind(todayStartIso, weekStartIso, monthStartIso, userId)
    .first<{
      total_seconds: number;
      today_seconds: number;
      week_seconds: number;
      month_seconds: number;
      session_count: number;
    }>();

  const profile = await db.prepare(
    'SELECT xp, level, streak FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first<{ xp: number; level: number; streak: number }>();

  const totalXp = profile?.xp ?? 0;
  const level = getLevelFromXp(totalXp);
  const xpForNextLevel = Math.max(100, 100 * level);
  const xpIntoLevel = totalXp - xpRequiredForLevel(level);

  return {
    totalStudySeconds: agg?.total_seconds ?? 0,
    todayStudySeconds: agg?.today_seconds ?? 0,
    weekStudySeconds: agg?.week_seconds ?? 0,
    monthStudySeconds: agg?.month_seconds ?? 0,
    studySessionCount: agg?.session_count ?? 0,
    totalXp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    progressPercent: Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100)),
    streak: profile?.streak ?? 0,
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
  const insertResult = await db.prepare(`
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
    stats,
  };
}
