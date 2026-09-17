'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, EmptyState } from '@/components/ui';
import { useAuth, useLivePageRefresh } from '@/contexts/AuthContext';
import {
  fetchSessionHistory,
  groupAnonymousHistory,
  type SessionHistoryEntry,
} from '@/lib/client/studySubmission';

const fmt = (s: number) => {
  const m = Math.round(s / 60);
  if (!m) return '0m';
  if (m >= 60) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${m}m`;
};

const dayKey = (iso: string) => iso.slice(0, 10);

const dayLabel = (key: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'long', day: 'numeric' }).format(new Date(`${key}T12:00:00`));

function modeLabel(mode: string): string {
  return (mode.charAt(0).toUpperCase() + mode.slice(1)).replace('-', ' ');
}

export default function HistoryPage() {
  const { user, statsRevision } = useAuth();
  const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const h = await fetchSessionHistory(200);
    if (h) setSessions(h);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      void load();
    } else {
      setSessions(groupAnonymousHistory());
      setLoading(false);
    }
  }, [user, load, statsRevision]);

  useLivePageRefresh(load);

  const groups = useMemo(() => {
    const map = new Map<string, SessionHistoryEntry[]>();
    for (const s of sessions) {
      const key = dayKey(s.startedAt);
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sessions]);

  const total = useMemo(() => sessions.reduce((sum, s) => sum + s.durationSeconds, 0), [sessions]);

  return (
    <DashboardLayout>
      <main className="space-y-6">
        <header className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Study Hub</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-950 dark:text-white">History</h1>
            <p className="mt-1 text-gray-600 dark:text-gray-400">Every study session, grouped by day.</p>
          </div>
          <Link
            href="/study/stopwatch"
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
          >
            Start studying
          </Link>
        </header>

        {!loading && sessions.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Total recorded: {fmt(total)}</p>
        )}

        {loading ? (
          <div className="animate-pulse h-32 w-full rounded-xl bg-gray-200 dark:bg-gray-700" />
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={<span className="text-4xl">🧭</span>}
                title="No study sessions yet"
                description="Start a timer or stopwatch and your sessions will appear here, grouped by day."
              />
            </CardContent>
          </Card>
        ) : (
          groups.map(([day, items]) => {
            const dayTotal = items.reduce((sum, s) => sum + s.durationSeconds, 0);
            return (
              <Card key={day}>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{dayLabel(day)}</h2>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{fmt(dayTotal)}</span>
                  </div>
                  <ul className="divide-y dark:divide-gray-800">
                    {items.map((s) => (
                      <li key={s.sessionId} className="flex items-center justify-between py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                            {s.subjectName ?? 'General'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {modeLabel(s.mode)}
                            {s.startedAt ? ` · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(s.startedAt))}` : ''}
                          </p>
                        </div>
                        <span className="ml-4 shrink-0 text-sm font-medium text-gray-600 dark:text-gray-300">{fmt(s.durationSeconds)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>
    </DashboardLayout>
  );
}