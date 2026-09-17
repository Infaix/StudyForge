'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Subject } from '@/types';
import {
  normalizeGoalInput,
  computeGoalProgress,
  computeGoalRecommendation,
  type GoalWeeklyTotals,
  type StudyGoalProgress,
  type GoalRecommendation,
} from '@/lib/goals';
import { getZonedDayBounds } from '@/lib/time';
import { getClientTimeZone, getAnonymousSegments, getPendingSegments } from './studySubmission';
import {
  getAnonymousGoals,
  saveAnonymousGoal,
  updateAnonymousGoal,
  deleteAnonymousGoal,
  migrateAnonymousGoals,
} from './goalStore';

export interface GoalPayload {
  subjectId?: string | null;
  targetSeconds: number;
  enabled?: boolean;
}

export interface MigrationNotice {
  migrated: number;
  conflicts: number;
}

/**
 * Weekly totals derived from the SAME local segment store the anonymous timer
 * persists to (anon + pending offline queue). Week boundary resolves through
 * the canonical Monday-start timezone helpers.
 */
export function weeklyTotalsFromLocalSegments(
  segments: Array<{ subjectId?: string | null; startedAt: string; durationSeconds: number }>,
  timeZone: string
): GoalWeeklyTotals {
  const weekStartIso = getZonedDayBounds(Date.now(), timeZone).weekStartIso;
  const weekStartMs = new Date(weekStartIso).getTime();
  let weeklyTotalSeconds = 0;
  const weeklyBySubject = new Map<string, number>();
  for (const s of segments) {
    const startMs = new Date(s.startedAt).getTime();
    if (Number.isNaN(startMs) || startMs < weekStartMs) continue;
    weeklyTotalSeconds += s.durationSeconds;
    if (s.subjectId) {
      weeklyBySubject.set(s.subjectId, (weeklyBySubject.get(s.subjectId) ?? 0) + s.durationSeconds);
    }
  }
  return { weeklyTotalSeconds, weeklyBySubject };
}

export interface UseStudyGoalsResult {
  progress: StudyGoalProgress[];
  recommendation: GoalRecommendation | null;
  weeklyTotalSeconds: number;
  isLoading: boolean;
  error: string | null;
  migrationNotice: MigrationNotice | null;
  create: (input: GoalPayload) => Promise<boolean>;
  update: (id: string, input: GoalPayload) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

/**
 * Single source of Study-Goal state for the hub and goal editor.
 * Signed-in reads/writes server D1 via /api/goals; anonymous persists locally
 * with deterministic migration into the account on sign-in.
 */
export function useStudyGoals(subjects?: Subject[]): UseStudyGoalsResult {
  const { user } = useAuth();
  const tz = getClientTimeZone();

  const [progress, setProgress] = useState<StudyGoalProgress[]>([]);
  const [recommendation, setRecommendation] = useState<GoalRecommendation | null>(null);
  const [weeklyTotalSeconds, setWeeklyTotalSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<MigrationNotice | null>(null);

  const subjectNames = useMemo(
    () => new Map((subjects ?? []).map((s) => [s.id, s.name])),
    [subjects]
  );

  const loadAnonymous = useCallback(() => {
    const anon = getAnonymousGoals();
    const segments = [...getAnonymousSegments(), ...getPendingSegments()];
    const totals = weeklyTotalsFromLocalSegments(segments, tz);
    const computed = computeGoalProgress(anon, totals, subjectNames);
    setProgress(computed);
    setRecommendation(computeGoalRecommendation(computed));
    setWeeklyTotalSeconds(totals.weeklyTotalSeconds);
    setIsLoading(false);
    setError(null);
  }, [subjectNames, tz]);

  const loadServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/goals?tz=${encodeURIComponent(tz)}`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error ?? 'Failed to load goals');
        setProgress([]);
        setRecommendation(null);
        setWeeklyTotalSeconds(0);
        return;
      }
      setProgress(data.progress as StudyGoalProgress[]);
      setRecommendation((data.recommendation as GoalRecommendation | null) ?? null);
      setWeeklyTotalSeconds((data.weeklyTotalSeconds as number) ?? 0);
      setError(null);
    } catch {
      setError('Failed to load goals');
    } finally {
      setIsLoading(false);
    }
  }, [tz]);

  const reload = useCallback(async () => {
    setIsLoading(true);
    if (user) await loadServer();
    else loadAnonymous();
  }, [user, loadAnonymous, loadServer]);

  const migrate = useCallback(async () => {
    try {
      let serverGoals: ReturnType<typeof getAnonymousGoals> = [];
      try {
        const res = await fetch(`/api/goals?tz=${encodeURIComponent(tz)}`, { credentials: 'include' });
        const data = await res.json().catch(() => null);
        if (data?.success) serverGoals = (data.progress ?? []).map((p: StudyGoalProgress) => p.goal);
      } catch {}
      const notice = await migrateAnonymousGoals(serverGoals);
      if (notice.migrated > 0 || notice.conflicts > 0) {
        setMigrationNotice(notice);
        await loadServer();
      }
    } catch {}
  }, [loadServer, tz]);

  useEffect(() => {
    setIsLoading(true);
    if (user) {
      void loadServer();
      void migrate();
    } else {
      loadAnonymous();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const create = useCallback(
    async (input: GoalPayload): Promise<boolean> => {
      const parsed = normalizeGoalInput({
        subjectId: input.subjectId ?? null,
        targetSeconds: input.targetSeconds,
        enabled: input.enabled,
      });
      if (!parsed.ok) {
        setError(parsed.error);
        return false;
      }
      if (user) {
        const res = await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(parsed.value),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          setError(data?.error ?? 'Failed to create goal');
          return false;
        }
        await loadServer();
        return true;
      }
      const goal = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `goal-${Date.now().toString(36)}`,
        userId: '',
        subjectId: parsed.value.subjectId,
        period: parsed.value.period,
        targetSeconds: parsed.value.targetSeconds,
        enabled: parsed.value.enabled,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const saved = saveAnonymousGoal(goal);
      if (!saved) setError('A goal already exists for this subject');
      loadAnonymous();
      return saved;
    },
    [user, loadServer, loadAnonymous]
  );

  const update = useCallback(
    async (id: string, input: GoalPayload): Promise<boolean> => {
      const parsed = normalizeGoalInput({
        subjectId: input.subjectId ?? null,
        targetSeconds: input.targetSeconds,
        enabled: input.enabled,
      });
      if (!parsed.ok) {
        setError(parsed.error);
        return false;
      }
      if (user) {
        const res = await fetch(`/api/goals/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(parsed.value),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          setError(data?.error ?? 'Failed to update goal');
          return false;
        }
        await loadServer();
        return true;
      }
      const updated = updateAnonymousGoal(id, {
        targetSeconds: parsed.value.targetSeconds,
        enabled: parsed.value.enabled,
      });
      if (!updated) {
        setError('Goal not found');
        return false;
      }
      loadAnonymous();
      return true;
    },
    [user, loadServer, loadAnonymous]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (user) {
        const res = await fetch(`/api/goals/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          setError(data?.error ?? 'Failed to delete goal');
          return false;
        }
        await loadServer();
        return true;
      }
      deleteAnonymousGoal(id);
      loadAnonymous();
      return true;
    },
    [user, loadServer, loadAnonymous]
  );

  return {
    progress,
    recommendation,
    weeklyTotalSeconds,
    isLoading,
    error,
    migrationNotice,
    create,
    update,
    remove,
    reload,
  };
}