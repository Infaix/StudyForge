import { describe, it, expect } from 'vitest';
import type { StudyGoal } from '@/types';
import {
  normalizeGoalInput,
  computeGoalProgress,
  computeGoalRecommendation,
  resolveGoalMigration,
} from '../goals';

const now = new Date('2026-09-16T12:00:00Z').getTime();

function makeGoal(partial: Partial<StudyGoal> = {}, id = `g-${Math.random()}`): StudyGoal {
  return {
    id,
    userId: 'u1',
    subjectId: null,
    period: 'weekly',
    targetSeconds: 5 * 3600,
    enabled: true,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...partial,
  };
}

describe('normalizeGoalInput', () => {
  it('accepts a valid overall goal', () => {
    const r = normalizeGoalInput({ subjectId: null, targetSeconds: 2 * 3600 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.subjectId).toBeNull();
      expect(r.value.period).toBe('weekly');
      expect(r.value.enabled).toBe(true);
    }
  });

  it('accepts a valid per-subject goal', () => {
    const r = normalizeGoalInput({ subjectId: 'subj-math', targetSeconds: 3600 });
    expect(r.ok).toBe(true);
  });

  it('rejects non-weekly periods', () => {
    const r = normalizeGoalInput({ subjectId: null, targetSeconds: 3600, period: 'monthly' as never });
    expect(r.ok).toBe(false);
  });

  it('rejects targets of 0 or negative', () => {
    expect(normalizeGoalInput({ subjectId: null, targetSeconds: 0 }).ok).toBe(false);
    expect(normalizeGoalInput({ subjectId: null, targetSeconds: -5 }).ok).toBe(false);
  });

  it('rejects targets above one week (7 * 24h)', () => {
    const r = normalizeGoalInput({ subjectId: null, targetSeconds: 7 * 24 * 3600 + 1 });
    expect(r.ok).toBe(false);
  });

  it('floors fractional targets', () => {
    const r = normalizeGoalInput({ subjectId: null, targetSeconds: 90.9 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.targetSeconds).toBe(90);
  });

  it('maps "" empty subjectId to null (overall)', () => {
    const r = normalizeGoalInput({ subjectId: '', targetSeconds: 3600 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.subjectId).toBeNull();
  });
});

describe('computeGoalProgress', () => {
  const totals = { weeklyTotalSeconds: 3 * 3600, weeklyBySubject: new Map([['s-math', 3600]]) };

  it('computes overall progress from total weekly seconds', () => {
    const p = computeGoalProgress([makeGoal({ subjectId: null, targetSeconds: 3 * 3600 })], totals);
    expect(p).toHaveLength(1);
    expect(p[0].weeklySeconds).toBe(3 * 3600);
    expect(p[0].progressPercent).toBe(100);
    expect(p[0].reached).toBe(true);
    expect(p[0].remainingSeconds).toBe(0);
  });

  it('can exceed 100% without being capped', () => {
    const p = computeGoalProgress([makeGoal({ subjectId: null, targetSeconds: 3600 })], {
      weeklyTotalSeconds: 7200,
      weeklyBySubject: new Map(),
    });
    expect(p[0].progressPercent).toBeGreaterThan(100);
    expect(p[0].remainingSeconds).toBeLessThan(0);
  });

  it('maps subject seconds through the subject map', () => {
    const p = computeGoalProgress(
      [makeGoal({ subjectId: 's-math' })],
      totals,
      new Map([['s-math', 'Math']])
    );
    expect(p[0].subjectName).toBe('Math');
    expect(p[0].weeklySeconds).toBe(3600);
  });

  it('respects disabled goals as zero-progress and hides the label name', () => {
    const p = computeGoalProgress(
      [makeGoal({ subjectId: 's-chem', enabled: false })],
      { weeklyTotalSeconds: 7200, weeklyBySubject: new Map([['s-chem', 7200]]) }
    );
    expect(p[0].weeklySeconds).toBe(0);
    expect(p[0].progressPercent).toBe(0);
  });

  it('sorts enabled goals first with overall ahead of subjects by progress', () => {
    const goals = [
      makeGoal({ subjectId: null, targetSeconds: 7200, enabled: false }, 'g-overall-disabled'),
      makeGoal({ subjectId: 's-slow', targetSeconds: 7200 }, 'g-slow'),
      makeGoal({ subjectId: null, targetSeconds: 7200 }, 'g-overall'),
    ];
    const p = computeGoalProgress(goals, {
      weeklyTotalSeconds: 7200,
      weeklyBySubject: new Map([['s-slow', 3600]]), // 50%
    });
    // Overall (100% from total) sorts before the 50% subject.
    expect(p[0].goal.id).toBe('g-overall');
    expect(p[1].goal.id).toBe('g-slow');
    // Disabled goals come last with hidden progress.
    expect(p[2].goal.id).toBe('g-overall-disabled');
  });
});

describe('computeGoalRecommendation', () => {
  it('picks the goal furthest behind by completion % (not raw hours)', () => {
    // math is at 50% (500/1000), chem at 90% (1800/2000). math is more behind
    // by percentage even though chem has fewer absolute seconds remaining.
    const progress = [
      {
        goal: makeGoal({ subjectId: 's-math', targetSeconds: 1000 }, 'g-math'),
        subjectName: 'Math',
        weeklySeconds: 500, // 50%
        targetSeconds: 1000,
        progressPercent: 50,
        remainingSeconds: 500,
        reached: false,
      },
      {
        goal: makeGoal({ subjectId: 's-chem', targetSeconds: 2000 }, 'g-chem'),
        subjectName: 'Chem',
        weeklySeconds: 1800, // 90%
        targetSeconds: 2000,
        progressPercent: 90,
        remainingSeconds: 200,
        reached: false,
      },
    ];
    const rec = computeGoalRecommendation(progress);
    expect(rec).not.toBeNull();
    expect(rec!.goalId).toBe('g-math');
    expect(rec!.progressPercent).toBe(50);
  });

  it('compares completion percentage, not raw hours', () => {
    // chem has more absolute remaining seconds but is closer by percentage
    // (90%) than overall (65%), so overall is the recommendation.
    const progress = [
      {
        goal: makeGoal({ subjectId: 's-chem', targetSeconds: 10000 }, 'g-chem'),
        subjectName: 'Chem',
        weeklySeconds: 9000, // 90%
        targetSeconds: 10000,
        progressPercent: 90,
        remainingSeconds: 1000,
        reached: false,
      },
      {
        goal: makeGoal({ subjectId: null, targetSeconds: 1000 }, 'g-overall'),
        subjectName: null,
        weeklySeconds: 650, // 65%
        targetSeconds: 1000,
        progressPercent: 65,
        remainingSeconds: 350,
        reached: false,
      },
    ];
    const rec = computeGoalRecommendation(progress);
    expect(rec!.goalId).toBe('g-overall');
  });

  it('returns null when there are no goals', () => {
    expect(computeGoalRecommendation([])).toBeNull();
  });
});

describe('resolveGoalMigration', () => {
  it('keeps non-conflicting local goals for creation', () => {
    const local = [makeGoal({ subjectId: null }, 'g-local-overall')];
    const server: StudyGoal[] = [makeGoal({ subjectId: 's-preexisting' }, 'g-server')];
    const r = resolveGoalMigration(local, server);
    expect(r.toCreate.map((g) => g.id)).toEqual(['g-local-overall']);
    expect(r.conflicts).toHaveLength(0);
  });

  it('flags a slot conflict when the account already has that subject goal', () => {
    const local = [makeGoal({ subjectId: 's-math' }, 'g-local-math')];
    const server: StudyGoal[] = [makeGoal({ subjectId: 's-math' }, 'g-server-math')];
    const r = resolveGoalMigration(local, server);
    expect(r.toCreate).toHaveLength(0);
    expect(r.conflicts.map((g) => g.id)).toEqual(['g-local-math']);
  });

  it('flags an overall conflict when the account has an overall goal', () => {
    const local = [makeGoal({ subjectId: null }, 'g-local-overall')];
    const server: StudyGoal[] = [makeGoal({ subjectId: null }, 'g-server-overall')];
    const r = resolveGoalMigration(local, server);
    expect(r.toCreate).toHaveLength(0);
    expect(r.conflicts).toHaveLength(1);
  });
});