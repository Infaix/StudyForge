'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Badge } from '@/components/ui';
import { subjectStorage } from '@/lib/storage';
import { Subject } from '@/types';
import {
  useStudyTimeSync,
  SyncStatus,
} from '@/lib/client/useStudyTimeSync';

const DEFAULT_SUBJECTS: Subject[] = [
  { id: '', name: 'Maths Methods', colour: '#3b82f6', icon: '📐', createdAt: '' },
  { id: '', name: 'Physics', colour: '#8b5cf6', icon: '⚛️', createdAt: '' },
  { id: '', name: 'English Language', colour: '#22c55e', icon: '📖', createdAt: '' },
  { id: '', name: 'Software Development', colour: '#f59e0b', icon: '💻', createdAt: '' },
];

interface Lap {
  id: number;
  time: number;
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds * 100) % 100);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

function formatTimeShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  idle: '',
  syncing: 'Syncing…',
  synced: 'Synced',
  pending: 'Pending sync',
  offline: 'Offline — will sync',
};

export default function StudyStopwatch() {
  const { user } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [lapAnchor, setLapAnchor] = useState(0); // displayed elapsed at last lap
  const [showSummary, setShowSummary] = useState<{ seconds: number; xp: number } | null>(null);
  const [, setTick] = useState(0); // re-render for the running clock

  const lapCounterRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

  useEffect(() => {
    subjectStorage.getAll().then((stored) => {
      if (stored.length > 0) setSubjects(stored);
    }).catch(() => {});
  }, []);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) || null;

  // All persistence concerns live in the shared hook (spec #26).
  const sync = useStudyTimeSync({
    mode: 'stopwatch',
    getSubject: useCallback(
      () => ({ id: selectedSubjectId || undefined, name: selectedSubject?.name ?? null }),
      [selectedSubjectId, selectedSubject]
    ),
  });

  const stopClockInterval = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startClockInterval = () => {
    stopClockInterval();
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 250);
  };

  const startTimer = () => {
    sync.beginSession();
    sync.openRun();
    setLapAnchor(0);
    lapCounterRef.current = 0;
    setLaps([]);
    setIsRunning(true);
    setIsPaused(false);
    startClockInterval();
  };

  /** Pause: immediately submit the newly elapsed time (spec #6). */
  const pauseTimer = async () => {
    stopClockInterval();
    setIsRunning(false);
    setIsPaused(true);
    await sync.pauseAndFlush();
  };

  const resumeTimer = () => {
    sync.resumeRun();
    setIsRunning(true);
    setIsPaused(false);
    startClockInterval();
  };

  /** Stop: submit remaining active time (completed=true) and close out. */
  const stopTimer = async () => {
    stopClockInterval();
    setIsRunning(false);
    setIsPaused(false);
    await sync.stopAndClose();
    const totals = sync.getSessionTotals();
    if (totals.seconds > 0 || totals.xp > 0) {
      setShowSummary(totals);
    }
  };

  const recordLap = () => {
    if (!isRunning) return;
    const elapsed = sync.studiedSeconds();
    const lapTime = elapsed - lapAnchor;
    setLapAnchor(elapsed);
    lapCounterRef.current += 1;
    setLaps((prev) => [{ id: lapCounterRef.current, time: lapTime }, ...prev]);
  };

  useEffect(() => () => stopClockInterval(), []);

  const currentLapTime = sync.studiedSeconds() - lapAnchor;
  const bestLap = laps.length > 0 ? laps.reduce((best, lap) => (lap.time < best.time ? lap : best), laps[0]) : null;
  const hasUnsavedWork =
    isRunning || isPaused || sync.recordedSeconds > 0 || sync.pendingSeconds > 0;

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Study Stopwatch
          </h1>
          {selectedSubject && (
            <Badge variant="info">{selectedSubject.name}</Badge>
          )}
        </div>

        {sync.lastAward && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200 flex items-center justify-between">
            <span>
              Saved <span className="font-semibold">{formatTimeShort(sync.lastAward.seconds)}</span> of study time
            </span>
            <span className="font-bold">+{sync.lastAward.xp} XP</span>
          </div>
        )}
        {sync.lastProblem === 'auth' ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            Session expired — please sign in again to sync your study time.
          </div>
        ) : sync.pendingSeconds > 0 && sync.status === 'offline' ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
            {formatTimeShort(sync.pendingSeconds)} pending sync — will retry automatically when your connection is restored.
          </div>
        ) : sync.lastProblem === 'server' && (sync.pendingSeconds > 0 || sync.queuedCount > 0) ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
            Sync temporarily unavailable — we&apos;ll retry automatically ({formatTimeShort(sync.pendingSeconds)} waiting).
          </div>
        ) : sync.pendingSeconds > 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
            {formatTimeShort(sync.pendingSeconds)} pending sync — will retry automatically when your connection is restored.
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <div className="text-7xl md:text-8xl font-mono font-bold text-gray-900 dark:text-white tracking-wider mb-2">
                    {formatTime(sync.studiedSeconds())}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    Recorded: {formatTime(sync.recordedSeconds)}
                    {sync.pendingSeconds > 0 && <> · Pending: {formatTime(sync.pendingSeconds)}</>}
                    {' · '}
                    <span
                      className={
                        sync.status === 'pending' || sync.status === 'offline'
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : sync.status === 'synced'
                            ? 'text-green-600 dark:text-green-400'
                            : ''
                      }
                    >
                      {SYNC_LABELS[sync.status]}
                    </span>
                  </div>
                  {isRunning && (
                    <div className="text-lg font-mono text-blue-600 dark:text-blue-400 mt-1">
                      Lap: {formatTime(currentLapTime)}
                    </div>
                  )}
                  {isPaused && (
                    <div className="text-lg font-mono text-yellow-600 dark:text-yellow-400 mt-1">
                      Paused
                    </div>
                  )}
                  {!isRunning && !isPaused && (
                    <div className="text-lg text-gray-400 dark:text-gray-500 mt-1">
                      Ready
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-3">
              {!hasUnsavedWork ? (
                <Button onClick={startTimer} variant="primary" size="lg" className="col-span-3">
                  Start
                </Button>
              ) : isRunning ? (
                <>
                  <Button onClick={pauseTimer} variant="secondary" size="lg">
                    Pause
                  </Button>
                  <Button onClick={recordLap} variant="ghost" size="lg">
                    Lap
                  </Button>
                  <Button onClick={stopTimer} variant="ghost" size="lg">
                    Stop
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={resumeTimer} variant="primary" size="lg">
                    Resume
                  </Button>
                  <Button onClick={() => {}} variant="ghost" size="lg" disabled>
                    Lap
                  </Button>
                  <Button onClick={stopTimer} variant="ghost" size="lg">
                    Stop
                  </Button>
                </>
              )}
            </div>

            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Subject
                </h3>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed text-base"
                >
                  <option value="">No subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id || subject.name} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Statistics
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Current Session</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {formatTimeShort(sync.studiedSeconds())}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Today</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {sync.stats ? formatTimeShort(sync.stats.todayStudySeconds) : '…'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">This Week</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {sync.stats ? formatTimeShort(sync.stats.weekStudySeconds) : '…'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total XP</span>
                  <Badge variant="success">{sync.stats ? sync.stats.totalXp : user.xp}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Level</span>
                  <Badge variant="info">{sync.stats ? sync.stats.level : user.level}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Laps ({laps.length})
                </h3>
              </CardHeader>
              <CardContent>
                {laps.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                    No laps recorded yet
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {laps.slice(0, 20).map((lap) => (
                      <div
                        key={lap.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                          bestLap && lap.id === bestLap.id
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-gray-50 dark:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-6">
                            #{lap.id}
                          </span>
                          {bestLap && lap.id === bestLap.id && (
                            <Badge variant="success">Best</Badge>
                          )}
                        </div>
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {formatTime(lap.time)}
                        </span>
                      </div>
                    ))}
                    {laps.length > 20 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-2">
                        + {laps.length - 20} more laps
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {showSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Session Saved
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  You studied for{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatTimeShort(showSummary.seconds)}
                  </span>
                  {selectedSubject && (
                    <> in <span className="font-semibold text-gray-900 dark:text-white">{selectedSubject.name}</span></>
                  )}
                  . Your study time and XP were saved to your account.
                </p>
                {sync.pendingSeconds > 0 && (
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {formatTimeShort(sync.pendingSeconds)} is still syncing and will be retried automatically.
                  </p>
                )}
                <Button
                  onClick={() => {
                    setShowSummary(null);
                    setLaps([]);
                    setLapAnchor(0);
                    lapCounterRef.current = 0;
                    // Reset session-local counters for a clean next run.
                    sync.beginSession();
                    sync.refreshStatsNow();
                  }}
                  variant="primary"
                  className="w-full"
                >
                  Done
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
