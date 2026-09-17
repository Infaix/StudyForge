'use client';

/**
 * Anonymous (signed-out) Study Goals.
 *
 * Goals for anonymous users live durably in localStorage with the same
 * philosophy as anonymous study history: they work fully offline and migrate
 * into the authenticated account on sign-in using a deterministic
 * reconciliation — if the account already has a goal for the same slot
 * (subject, or overall when subject_id NULL) the account's goal is left
 * untouched and the local one is dropped as resolved (never silently
 * overwriting an existing account goal).
 */

import type { StudyGoal } from '@/types';
import { resolveGoalMigration } from '@/lib/goals';

const ANON_GOALS_KEY = 'studyforge-anon-goals';

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {}
  return null;
}

export function getAnonymousGoals(): StudyGoal[] {
  const store = safeStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(ANON_GOALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StudyGoal[]) : [];
  } catch {
    return [];
  }
}

function setAnonymousGoals(list: StudyGoal[]): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(ANON_GOALS_KEY, JSON.stringify(list));
  } catch {}
}

function goalSlot(goal: Pick<StudyGoal, 'subjectId'>): string {
  return goal.subjectId ?? '__overall__';
}

/** Save a local goal, rejecting a duplicate slot (same subject / overall). */
export function saveAnonymousGoal(goal: StudyGoal): boolean {
  const list = getAnonymousGoals();
  if (list.some((g) => goalSlot(g) === goalSlot(goal) && g.id !== goal.id)) return false;
  list.push(goal);
  setAnonymousGoals(list);
  return true;
}

export function updateAnonymousGoal(id: string, patch: Partial<Pick<StudyGoal, 'targetSeconds' | 'enabled'>>): StudyGoal | null {
  const list = getAnonymousGoals();
  const idx = list.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  const updated: StudyGoal = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
  list[idx] = updated;
  setAnonymousGoals(list);
  return updated;
}

export function deleteAnonymousGoal(id: string): void {
  setAnonymousGoals(getAnonymousGoals().filter((g) => g.id !== id));
}

/**
 * Upload local anonymous goals into the freshly authenticated account.
 *
 * - Non-conflicting goals → POST /api/goals; removed locally only AFTER ack.
 * - Conflicting goals (account already owns the slot) → NOT uploaded; dropped
 *   locally and counted as conflicts so the UI can tell the user what happened.
 * - Network/auth failures keep the local goals for a later retry.
 */
export async function migrateAnonymousGoals(
  serverGoals: StudyGoal[]
): Promise<{ migrated: number; conflicts: number }> {
  const anon = getAnonymousGoals();
  if (anon.length === 0) return { migrated: 0, conflicts: 0 };

  const { toCreate, conflicts } = resolveGoalMigration(anon, serverGoals);
  let migrated = 0;
  const resolved = new Set<string>(conflicts.map((g) => g.id));

  for (const goal of toCreate) {
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subjectId: goal.subjectId,
          period: goal.period,
          targetSeconds: goal.targetSeconds,
          enabled: goal.enabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        migrated += 1;
        resolved.add(goal.id);
      } else if (res.status === 401 || res.status === 403) {
        // Still not authenticated — keep everything for a later attempt.
        break;
      } else {
        // Definitive rejection (validation/duplicate race): resolve by
        // dropping this single entry so one bad goal never blocks the rest.
        resolved.add(goal.id);
      }
    } catch {
      // Network failure — keep local, retry later.
    }
  }

  setAnonymousGoals(getAnonymousGoals().filter((g) => !resolved.has(g.id)));
  return { migrated, conflicts: conflicts.length };
}