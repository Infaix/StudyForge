import type { StudyGoal, GoalPeriod } from '@/types';

/**
 * Pure Study-Goal logic — no DB, no worker imports (client + server safe).
 *
 * Progress ALWAYS derives from canonical timezone-aware study statistics:
 * callers supply the current week's totals (resolved through the same
 * `getZonedDayBounds` used by getUserStudyStats) and this module maps them to
 * percentages. No separate study-time counter exists.
 */

export const SUPPORTED_GOAL_PERIODS: GoalPeriod[] = ['weekly'];

export const MAX_GOAL_TARGET_SECONDS = 7 * 24 * 3600; // one week cap is sensible for a weekly target

export interface NormalizedGoalInput {
  subjectId: string | null;
  period: GoalPeriod;
  targetSeconds: number;
  enabled: boolean;
}

/**
 * Validate a goal mutation from an untrusted client.
 * - target must be a positive integer number of seconds.
 * - period currently accepts only `weekly` (schema CHECK mirrors this).
 * - subjectId optional; ownership is enforced separately at the data layer.
 */
export function normalizeGoalInput(input: unknown): { ok: true; value: NormalizedGoalInput } | { ok: false; error: string } {
  const raw = (input ?? {}) as Record<string, unknown>;

  const targetSeconds =
    typeof raw.targetSeconds === 'number' && Number.isFinite(raw.targetSeconds)
      ? Math.floor(raw.targetSeconds)
      : typeof raw.targetSeconds === 'string' && raw.targetSeconds.trim() !== ''
        ? Math.floor(Number(raw.targetSeconds))
        : NaN;

  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
    return { ok: false, error: 'target must be a positive number of seconds' };
  }
  if (targetSeconds > MAX_GOAL_TARGET_SECONDS) {
    return { ok: false, error: 'target is unreasonably large' };
  }

  const period = raw.period ?? 'weekly';
  if (!SUPPORTED_GOAL_PERIODS.includes(period as GoalPeriod)) {
    return { ok: false, error: `unsupported goal period: ${String(period)}` };
  }

  let subjectId: string | null = null;
  if (typeof raw.subjectId === 'string' && raw.subjectId.trim() !== '') {
    const trimmed = raw.subjectId.trim().slice(0, 128);
    if (!/^[\w:#.\-]+$/.test(trimmed)) {
      return { ok: false, error: 'invalid subjectId format' };
    }
    subjectId = trimmed;
  }

  return {
    ok: true,
    value: {
      subjectId,
      period: period as GoalPeriod,
      targetSeconds,
      enabled: raw.enabled === false ? false : true,
    },
  };
}

export interface GoalWeeklyTotals {
  /** Canonical week-duration for the overall goal (all subjects). */
  weeklyTotalSeconds: number;
  /** SubjectId → canonical weekly seconds (only rows with a subject). */
  weeklyBySubject: Map<string, number>;
}

export interface StudyGoalProgress {
  goal: StudyGoal;
  subjectName: string | null;
  weeklySeconds: number;
  targetSeconds: number;
  /** Never artificially capped; a goal over its target exceeds 100%. */
  progressPercent: number;
  /** targetSeconds - weeklySeconds (negative when exceeded). */
  remainingSeconds: number;
  reached: boolean;
}

export function toProgress(
  goal: StudyGoal,
  totals: GoalWeeklyTotals,
  subjectNames?: Map<string, string>
): StudyGoalProgress {
  const weeklySeconds = goal.subjectId
    ? (totals.weeklyBySubject.get(goal.subjectId) ?? 0)
    : totals.weeklyTotalSeconds;
  const progressPercent = goal.targetSeconds > 0 ? (weeklySeconds / goal.targetSeconds) * 100 : 0;
  return {
    goal,
    subjectName: goal.subjectId ? (subjectNames?.get(goal.subjectId) ?? null) : null,
    weeklySeconds,
    targetSeconds: goal.targetSeconds,
    progressPercent,
    remainingSeconds: goal.targetSeconds - weeklySeconds,
    reached: weeklySeconds >= goal.targetSeconds,
  };
}

/**
 * Map stored goals onto the current week's canonical statistics.
 * Enabled goals only; disabled goals are still returned (progress hidden) so
 * editors can re-enable them without a refetch.
 */
export function computeGoalProgress(
  goals: StudyGoal[],
  totals: GoalWeeklyTotals,
  subjectNames?: Map<string, string>
): StudyGoalProgress[] {
  const active = goals.filter((g) => g.enabled);
  const rest = goals.filter((g) => !g.enabled);
  const withProgress = active.map((g) => toProgress(g, totals, subjectNames));
  // Overall first, then subjects by how close they are to their target
  // (furthest behind first — directly useful for "what should I study next?").
  withProgress.sort((a, b) => {
    if (!a.goal.subjectId && b.goal.subjectId) return -1;
    if (a.goal.subjectId && !b.goal.subjectId) return 1;
    return a.progressPercent - b.progressPercent;
  });
  return [...withProgress, ...rest.map((g) => toProgress(g, { weeklyTotalSeconds: 0, weeklyBySubject: new Map() }, subjectNames))];
}

export interface GoalRecommendation {
  goalId: string;
  kind: 'subject' | 'overall';
  subjectId: string | null;
  subjectName: string | null;
  progressPercent: number;
  remainingSeconds: number;
}

/**
 * Identify the goal furthest behind its WEEKLY TARGET by completion
 * PERCENTAGE (never by raw hours — 3h/6h beats 3h/4h as more behind).
 * Only enabled goals that are not yet reached compete. Returns null when
 * there is nothing to recommend (no enabled goals, or everything is done).
 */
export function computeGoalRecommendation(progress: StudyGoalProgress[]): GoalRecommendation | null {
  const contenders = progress
    .filter((p) => p.goal.enabled && !p.reached)
    .sort((a, b) => {
      // Lowest completion percentage = furthest behind.
      if (a.progressPercent !== b.progressPercent) return a.progressPercent - b.progressPercent;
      // Tie: prefer a subject (more actionable) then the larger gap.
      if (a.goal.subjectId && !b.goal.subjectId) return -1;
      if (!a.goal.subjectId && b.goal.subjectId) return 1;
      return b.remainingSeconds - a.remainingSeconds;
    });

  const pick = contenders[0];
  if (!pick) return null;

  return {
    goalId: pick.goal.id,
    kind: pick.goal.subjectId ? 'subject' : 'overall',
    subjectId: pick.goal.subjectId,
    subjectName: pick.subjectName,
    progressPercent: pick.progressPercent,
    remainingSeconds: pick.remainingSeconds,
  };
}

/**
 * Deterministic anonymous → account goal migration.
 *
 * A local goal is a conflict when the account already has a goal for the SAME
 * slot (same subject, or the overall slot for subject_id NULL). Conflicting
 * local goals are NOT uploaded and the account's goal is left untouched (we
 * never silently overwrite an existing account goal). Non-conflicting goals
 * are candidates for upload.
 */
export function resolveGoalMigration(
  anonGoals: StudyGoal[],
  serverGoals: StudyGoal[]
): { toCreate: StudyGoal[]; conflicts: StudyGoal[] } {
  const taken = new Set<string>(serverGoals.map((g) => g.subjectId ?? '__overall__'));
  const toCreate: StudyGoal[] = [];
  const conflicts: StudyGoal[] = [];
  for (const goal of anonGoals) {
    const slot = goal.subjectId ?? '__overall__';
    if (taken.has(slot)) conflicts.push(goal);
    else {
      toCreate.push(goal);
      taken.add(slot);
    }
  }
  return { toCreate, conflicts };
}