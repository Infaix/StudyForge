'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth, useLivePageRefresh } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui';
import { subjectStorage } from '@/lib/storage';
import {
  fetchSessionHistory,
  getLastCrossDeviceWarning,
  refreshUserStats,
  getAnonymousSeconds,
  groupAnonymousHistory,
  type SessionHistoryEntry,
  type CrossDeviceInfo,
} from '@/lib/client/studySubmission';
import { useActiveTimerForHub } from '@/components/hub/useActiveTimerForHub';
import { useStudyGoals } from '@/lib/client/useStudyGoals';
import { GoalEditor } from '@/components/hub/GoalEditor';
import { formatDuration, formatClock } from '@/lib/format';
import type { Subject } from '@/types';
import type { StudyStats } from '@/lib/server/study';
import { getClientTimeZone } from '@/lib/client/studySubmission';
import { zonedDateKey } from '@/lib/time';

const fmt = (s: number) => {
  const m = Math.round(s / 60);
  if (!m) return '0m';
  if (m >= 60) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${m}m`;
};

/** Anonymous "today" = closed anonymous segments that ended today. */
function anonTodaySeconds(): number {
  const today = zonedDateKey(Date.now(), getClientTimeZone());
  return groupAnonymousHistory()
    .filter((s) => zonedDateKey(new Date(s.endedAt).getTime(), getClientTimeZone()) === today)
    .reduce((sum, s) => sum + s.durationSeconds, 0);
}

export function StudyHub() {
  const { user, statsRevision } = useAuth();
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [cross, setCross] = useState<CrossDeviceInfo | null>(null);
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);

  const load = useCallback(async () => {
    const [s, h, sub] = await Promise.all([
      refreshUserStats(),
      fetchSessionHistory(5),
      subjectStorage.getAll(),
    ]);
    if (s) setStats(s);
    if (h) setSessions(h);
    setSubjects(sub);
    setCross(getLastCrossDeviceWarning());
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load, statsRevision]);

  useLivePageRefresh(load);

  const timer = useActiveTimerForHub();
  const { progress, recommendation, migrationNotice } = useStudyGoals(subjects);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);

  // Anonymous users see locally-stored data instead of account stats.
  const anon = !user;
  const anonTotal = anon ? getAnonymousSeconds() : 0;
  const anonToday = anon ? anonTodaySeconds() : 0;
  const recentSessions = anon ? groupAnonymousHistory().slice(0, 5) : sessions;
  const s = anon ? null : stats;
  const max = Math.max(1, ...(s?.byDay ?? []).map((d) => d.seconds));

  const days = useMemo(() => {
    const m = new Map((s?.byDay ?? []).map((d) => [d.date, d.seconds]));
    const n = new Date();
    const mon = new Date(n);
    const day = mon.getDay() || 7;
    mon.setDate(mon.getDate() - day + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return {
        label: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1),
        seconds: m.get(zonedDateKey(d.getTime(), getClientTimeZone())) ?? 0,
      };
    });
  }, [s]);

  // --- CTA derivation (hub §7) ---
  const ctaLabel = (() => {
    switch (timer.state) {
      case 'active': return `Resume · ${formatClock(timer.elapsedSeconds)}`;
      case 'paused': return `Paused · ${formatClock(timer.elapsedSeconds)} recorded`;
      case 'recovered': return `Recovered · ${formatClock(timer.elapsedSeconds)} since reload`;
      case 'other-tab': return 'Timer running in another tab';
      default: return 'Start studying';
    }
  })();
  const ctaHref = timer.state === 'other-tab' ? '/study/stopwatch' : '/study/stopwatch';

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-6xl space-y-6 pb-8">
        {/* Header + settings */}
        <header className="motion-enter flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Study Hub</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-950 dark:text-white">Start studying</h1>
            <p className="mt-1 text-gray-600 dark:text-gray-400">Your study time, kept together.</p>
          </div>
          <Link
            href="/settings"
            className="mt-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            ⚙ Settings
          </Link>
        </header>

        {/* Anonymous banner (no forced login) */}
        {anon && (
          <div role="status" className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <p>
              You&apos;re studying without an account. Your time is saved on this device and uploads to your account
              when you sign in — no loss of study time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/login"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Sign in to sync
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Create account
              </Link>
            </div>
          </div>
        )}

        {/* Migration notice */}
        {!anon && migrationNotice && (migrationNotice.migrated > 0 || migrationNotice.conflicts > 0) && (
          <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            {migrationNotice.migrated > 0 && (
              <span>{migrationNotice.migrated} goal{migrationNotice.migrated !== 1 ? 's' : ''} imported from your local session.</span>
            )}
            {migrationNotice.conflicts > 0 && (
              <span className="ml-2">{migrationNotice.conflicts} goal{migrationNotice.conflicts !== 1 ? 's were' : ' was'} not imported — an account goal already exists for that subject.</span>
            )}
          </div>
        )}

        {/* Cross-device warning */}
        {!anon && cross?.active && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Another INFAIX Study session may be active on another device. Your study history will still sync normally.
          </div>
        )}

        {/* Primary CTA */}
        <Card className="study-hero border-blue-300/30 bg-gradient-to-br from-[var(--surface-strong)] via-[var(--surface)] to-[var(--accent-soft)]">
          <CardContent className="p-6 text-center sm:p-10">
            {timer.state === 'none' && !(s?.totalStudySeconds ?? anonTotal) ? (
              <>
                <p className="text-sm text-gray-500">Ready when you are</p>
                <p className="mt-1 text-xs text-gray-400">Pick a mode and start your first session.</p>
              </>
            ) : timer.state !== 'none' ? (
              <>
                <p className="text-sm text-gray-500">{timer.snapshot?.mode ?? 'Study'} session</p>
                {timer.state === 'other-tab' ? (
                  <p className="mt-1 text-xs text-gray-400">Timer is running in another tab.</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">
                    {timer.snapshot?.subjectName ? `${timer.snapshot.subjectName} · ` : ''}
                    {formatClock(timer.totalSeconds)} total this session
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500">Ready when you are</p>
                <p className="mt-1 text-xs text-gray-400">Pick a mode and start your next session.</p>
              </>
            )}
              <Link
                href={ctaHref}
                className="premium-button mt-4 inline-block rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/20 hover:brightness-105"
              >
                {ctaLabel}
              </Link>
              <Link href="/study/lock-in" className="premium-button ml-3 mt-4 inline-block rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]">
                Exam Lock-In
              </Link>
          </CardContent>
        </Card>

        {/* Goal progress + editor CTA */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Study Goals</h2>
              <button
                onClick={() => setGoalEditorOpen(true)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                {progress.length === 0 ? 'Set goal' : 'Edit goals'}
              </button>
            </div>
            {progress.length > 0 ? (
              <div className="mt-3 space-y-3">
                {progress.map((p) => {
                  const pct = Math.max(0, p.progressPercent);
                  const subjectName = p.goal.subjectId === null ? 'Overall' : (subjectMap.get(p.goal.subjectId) ?? 'Unknown');
                  return (
                    <div key={p.goal.id}>
                      <div className="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                        <span className="truncate font-medium text-gray-800 dark:text-gray-200">{subjectName}</span>
                        <span>{formatDuration(p.weeklySeconds)} / {formatDuration(p.targetSeconds)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{Math.round(p.progressPercent)}%</p>
                      {p.reached && <p className="mt-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">Goal reached — great work!</p>}
                    </div>
                  );
                })}
                {recommendation && (
                  <p className="text-xs text-gray-500 italic dark:text-gray-400">
                    {recommendation.remainingSeconds > 0
                      ? `You're ${formatDuration(recommendation.remainingSeconds)} from reaching your ${recommendation.kind === 'overall' ? 'overall' : recommendation.subjectName ?? 'subject'} goal this week.`
                      : `You've exceeded your ${recommendation.kind === 'overall' ? 'overall' : recommendation.subjectName ?? 'subject'} goal — great work!`}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Set a weekly target to stay on track.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Goal editor modal */}
        <GoalEditor open={goalEditorOpen} onClose={() => setGoalEditorOpen(false)} subjects={subjects} />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {anon ? (
            <>
              <Stat label="Today" value={fmt(anonToday)} primary />
              <Stat label="All time" value={fmt(anonTotal)} />
              <Stat label="This Week" value="—" />
              <Stat label="Streak" value="—" />
            </>
          ) : (
            <>
              <Stat label="Today" value={fmt(s?.todayStudySeconds ?? 0)} primary />
              <Stat label="This Week" value={fmt(s?.weekStudySeconds ?? 0)} />
              <Stat label="Streak" value={`${s?.streak ?? 0}d`} />
              <Stat label="All time" value={fmt(s?.totalStudySeconds ?? 0)} />
            </>
          )}
        </div>

        {/* Bar chart */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-800 dark:text-gray-200">This week</h2>
            {anon ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sign in to see your weekly breakdown and streak.
              </p>
            ) : (
              <div className="flex items-end gap-2" style={{ height: 120 }}>
                {days.map((d, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="chart-bar w-full rounded-t bg-[var(--accent)] transition-all"
                      style={{ height: `${(d.seconds / max) * 100}%`, minHeight: d.seconds > 0 ? 4 : 0 }}
                      title={fmt(d.seconds)}
                    />
                    <span className="text-[10px] text-gray-400">{d.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent sessions */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Recent sessions</h2>
              <Link href="/history" className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400">
                View all →
              </Link>
            </div>
            {recentSessions.length === 0 ? (
              <p className="text-xs text-gray-500">No sessions yet.</p>
            ) : (
              <ul className="divide-y dark:divide-gray-800">
                {recentSessions.map((item) => (
                  <li key={item.sessionId} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                        {item.subjectName ?? 'General'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.startedAt ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(item.startedAt)) : '—'}
                      </p>
                    </div>
                    <span className="ml-4 shrink-0 text-sm font-medium text-gray-600 dark:text-gray-300">{fmt(item.durationSeconds)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}

function Stat({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={`premium-card rounded-2xl border p-4 ${primary ? 'metric-today border-[var(--accent)]/30 bg-[var(--accent-soft)]' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 font-bold ${primary ? 'text-3xl text-[var(--accent)]' : 'text-2xl text-gray-950 dark:text-white'}`}>{value}</p>
    </div>
  );
}
