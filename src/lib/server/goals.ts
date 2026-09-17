import { getDB } from '@/lib/db';
import type { StudyGoal } from '@/types';
import {
  normalizeGoalInput,
  computeGoalProgress,
  computeGoalRecommendation,
  type NormalizedGoalInput,
  type StudyGoalProgress,
  type GoalRecommendation,
} from '@/lib/goals';
import { getZonedDayBounds } from '@/lib/time';
import { getUserStudyStats } from './study';
import { getCurrentStudyIdentity } from '@/lib/auth/provider';

interface StudyGoalRow {
  id: string;
  user_id: string;
  subject_id: string | null;
  period: string;
  target_seconds: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const EFFECTIVE_SECONDS_SQL = 'COALESCE(ss.duration_seconds, ss.duration * 60)';

function mapGoalRow(row: StudyGoalRow): StudyGoal {
  return {
    id: row.id,
    userId: row.user_id,
    subjectId: row.subject_id,
    period: row.period === 'weekly' ? 'weekly' : 'weekly',
    targetSeconds: row.target_seconds,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Pure ownership guard (also mirrored in every SQL statement below). */
export function canModifyGoal(goalOwnerId: string, requesterId: string): boolean {
  return !!requesterId && goalOwnerId === requesterId;
}

export async function getStudyGoals(userId: string): Promise<StudyGoal[]> {
  const db = getDB();
  const { results } = await db
    .prepare(
      `SELECT id, user_id, subject_id, period, target_seconds, enabled, created_at, updated_at
       FROM study_goals WHERE user_id = ? ORDER BY (subject_id IS NOT NULL), created_at ASC`
    )
    .bind(userId)
    .all<StudyGoalRow>();
  return (results ?? []).map(mapGoalRow);
}

async function subjectNameMap(userId: string): Promise<Map<string, string>> {
  const db = getDB();
  const { results } = await db
    .prepare('SELECT id, name FROM subjects WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; name: string }>();
  return new Map((results ?? []).map((r) => [r.id, r.name]));
}

/**
 * Weekly per-subject seconds derived from canonical timezone-aware statistics
 * (same week boundary as getUserStudyStats, same effective-seconds formula).
 */
export async function getWeeklySubjectSeconds(userId: string, weekStartIso: string): Promise<Map<string, number>> {
  const db = getDB();
  const { results } = await db
    .prepare(
      `SELECT ss.subject_id AS subject_id, COALESCE(SUM(${EFFECTIVE_SECONDS_SQL}), 0) AS seconds
       FROM study_sessions ss
       WHERE ss.user_id = ?1 AND ss.start_time >= ?2 AND ss.subject_id IS NOT NULL
       GROUP BY ss.subject_id`
    )
    .bind(userId, weekStartIso)
    .all<{ subject_id: string; seconds: number }>();
  return new Map((results ?? []).map((r) => [r.subject_id, r.seconds ?? 0]));
}

export interface GoalProgressSet {
  progress: StudyGoalProgress[];
  recommendation: GoalRecommendation | null;
  weekStartIso: string;
  weekEndIso: string;
  weeklyTotalSeconds: number;
}

/**
 * Progress for every stored goal against THIS calendar week's canonical study
 * time. Week boundary uses the SAME Monday-start, timezone-aware logic as
 * getUserStudyStats — goals "roll over" automatically because progress is
 * derived from the current week, never stored or reset.
 */
export async function getGoalProgress(
  userId: string,
  opts: { timeZone?: string; nowMs?: number } = {}
): Promise<GoalProgressSet> {
  const timeZone = opts.timeZone ?? 'UTC';
  const nowMs = opts.nowMs ?? Date.now();
  const bounds = getZonedDayBounds(nowMs, timeZone);
  const weekStartMs = new Date(bounds.weekStartIso).getTime();

  const [goals, stats, weeklyBySubject, subjectNames] = await Promise.all([
    getStudyGoals(userId),
    getUserStudyStats(userId, { timeZone }),
    getWeeklySubjectSeconds(userId, bounds.weekStartIso),
    subjectNameMap(userId),
  ]);

  const progress = computeGoalProgress(
    goals,
    { weeklyTotalSeconds: stats.weekStudySeconds, weeklyBySubject },
    subjectNames
  );
  const recommendation = computeGoalRecommendation(progress);

  return {
    progress,
    recommendation,
    weekStartIso: bounds.weekStartIso,
    weekEndIso: new Date(weekStartMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
    weeklyTotalSeconds: stats.weekStudySeconds,
  };
}

async function subjectOwnedBy(userId: string, subjectId: string): Promise<boolean> {
  const db = getDB();
  const row = await db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
    .bind(subjectId, userId)
    .first<{ id: string }>();
  return !!row;
}

function applyNormalized(norm: NormalizedGoalInput, userId: string): StudyGoal & { _row: StudyGoalRow } {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId,
    subjectId: norm.subjectId,
    period: norm.period,
    targetSeconds: norm.targetSeconds,
    enabled: norm.enabled,
    createdAt: now,
    updatedAt: now,
    _row: {
      id: crypto.randomUUID(),
      user_id: userId,
      subject_id: norm.subjectId,
      period: norm.period,
      target_seconds: norm.targetSeconds,
      enabled: norm.enabled ? 1 : 0,
      created_at: now,
      updated_at: now,
    },
  };
}

export type GoalMutationResult = { ok: true; goal: StudyGoal } | { ok: false; error: string; status?: number };

export async function createStudyGoal(userId: string, input: unknown): Promise<GoalMutationResult> {
  const parsed = normalizeGoalInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  if (parsed.value.subjectId && !(await subjectOwnedBy(userId, parsed.value.subjectId))) {
    return { ok: false, error: 'Subject not found', status: 404 };
  }

  const db = getDB();
  const goal = applyNormalized(parsed.value, userId);
  const row = goal._row;

  try {
    await db
      .prepare(
        `INSERT INTO study_goals (id, user_id, subject_id, period, target_seconds, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(row.id, row.user_id, row.subject_id, row.period, row.target_seconds, row.enabled, row.created_at, row.updated_at)
      .run();
  } catch (err) {
    // Partial unique indexes reject duplicate slots (overall / same subject).
    const message = err instanceof Error ? err.message : '';
    if (/unique/i.test(message)) {
      return { ok: false, error: 'A goal already exists for this subject', status: 409 };
    }
    throw err;
  }

  const { _row, ...goalDto } = goal;
  return { ok: true, goal: goalDto };
}

export async function updateStudyGoal(userId: string, goalId: string, input: unknown): Promise<GoalMutationResult> {
  const parsed = normalizeGoalInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  const db = getDB();
  const existing = await db
    .prepare('SELECT user_id FROM study_goals WHERE id = ?')
    .bind(goalId)
    .first<{ user_id: string }>();
  if (!existing) return { ok: false, error: 'Goal not found', status: 404 };
  if (!canModifyGoal(existing.user_id, userId)) {
    return { ok: false, error: 'Not authorized to modify this goal', status: 403 };
  }

  if (parsed.value.subjectId && !(await subjectOwnedBy(userId, parsed.value.subjectId))) {
    return { ok: false, error: 'Subject not found', status: 404 };
  }

  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `UPDATE study_goals SET subject_id = ?1, period = ?2, target_seconds = ?3, enabled = ?4, updated_at = ?5
         WHERE id = ?6 AND user_id = ?7`
      )
      .bind(parsed.value.subjectId, parsed.value.period, parsed.value.targetSeconds, parsed.value.enabled ? 1 : 0, now, goalId, userId)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/unique/i.test(message)) {
      return { ok: false, error: 'A goal already exists for this subject', status: 409 };
    }
    throw err;
  }

  const row = await db
    .prepare(
      `SELECT id, user_id, subject_id, period, target_seconds, enabled, created_at, updated_at
       FROM study_goals WHERE id = ?`
    )
    .bind(goalId)
    .first<StudyGoalRow>();
  if (!row) return { ok: false, error: 'Goal not found', status: 404 };

  const goal = mapGoalRow(row);
  return { ok: true, goal };
}

export async function deleteStudyGoal(userId: string, goalId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const db = getDB();
  const result = await db
    .prepare('DELETE FROM study_goals WHERE id = ? AND user_id = ?')
    .bind(goalId, userId)
    .run();
  if ((result.meta?.changes ?? 0) === 0) {
    return { ok: false, error: 'Goal not found', status: 404 };
  }
  return { ok: true };
}

/**
 * The requester must carry a valid session; goals are always scoped to the
 * authenticated user (the client can never pick a user_id).
 */
export async function requireCurrentUser(request: Request): Promise<string | null> {
  const identity = await getCurrentStudyIdentity(request);
  return identity?.userId ?? null;
}
