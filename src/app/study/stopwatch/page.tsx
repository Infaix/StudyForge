'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Badge } from '@/components/ui';
import { subjectStorage } from '@/lib/storage';
import { Subject } from '@/types';
import {
  StudySessionClient,
  StudyStats,
  SegmentAck,
  MIN_SUBMIT_SECONDS,
  refreshUserStats,
  flushPendingSegments,
  getPendingSegments,
  startPendingFlush,
  enqueuePendingSegment,
} from '@/lib/client/studySubmission';

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

export default function StudyStopwatch() {
  const { user, updateUser } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);

  // Two-concept tracking (spec #13):
  //   recorded  — seconds acknowledged by the server
  //   active    — seconds since the most recent resume (never yet submitted)
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [pendingSeconds, setPendingSeconds] = useState(0); // queued, awaiting retry
  const [lastAward, setLastAward] = useState<{ seconds: number; xp: number; id: number } | null>(null);
  const [showSummary, setShowSummary] = useState<{ seconds: number; xp: number } | null>(null);

  const [stats, setStats] = useState<StudyStats | null>(null);
  const [, setTick] = useState(0); // re-render for the running clock

  const sessionRef = useRef<StudySessionClient | null>(null);
  const runStartRef = useRef<number | null>(null); // ms timestamp of current active run
  const segStartRef = useRef<string>(''); // ISO start of the open segment
  const lapAnchorRef = useRef<number>(0); // displayed elapsed at last lap
  const lapCounterRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const awardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTotalsRef = useRef({ seconds: 0, xp: 0 }); // acked totals for this session

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

  // Load real subjects (ids required for subject attribution server-side).
  useEffect(() => {
    subjectStorage.getAll().then((stored) => {
      if (stored.length > 0) setSubjects(stored);
    }).catch(() => {});
  }, []);

  // Authoritative stats straight from D1.
  const applyStats = useCallback((s: StudyStats | null) => {
    if (!s) return;
    setStats(s);
    updateUser({
      xp: s.totalXp,
      level: s.level,
      streak: s.streak,
      studyTimeToday: Math.floor(s.todayStudySeconds / 60),
      studyTimeThisWeek: Math.floor(s.weekStudySeconds / 60),
      studyTimeThisMonth: Math.floor(s.monthStudySeconds / 60),
      studyTimeAllTime: Math.floor(s.totalStudySeconds / 60),
    });
  }, [updateUser]);

  useEffect(() => {
    if (!user) return;
    refreshUserStats().then(setStats);
    startPendingFlush((ack) => {
      // A queued segment just made it to the server.
      setPendingSeconds((p) => Math.max(0, p - ack.recordedSeconds));
      applyStatsFromAck(ack);
    });
    if (getPendingSegments().length > 0) {
      flushPendingSegments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const applyStatsFromAck = useCallback((ack: SegmentAck) => {
    setRecordedSeconds((r) => r + ack.recordedSeconds);
    sessionTotalsRef.current.seconds += ack.recordedSeconds;
    sessionTotalsRef.current.xp += ack.awardedXp;
    if (ack.stats) applyStats(ack.stats);
    if (ack.recordedSeconds > 0 || ack.awardedXp > 0) {
      awardTimeoutRef.current && clearTimeout(awardTimeoutRef.current);
      setLastAward({ seconds: ack.recordedSeconds, xp: ack.awardedXp, id: Date.now() });
      awardTimeoutRef.current = setTimeout(() => setLastAward(null), 6000);
    }
  }, [applyStats]);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) || null;

  const getSubjectForSubmission = useCallback(() => ({
    id: selectedSubjectId || undefined,
    name: selectedSubject?.name ?? null,
  }), [selectedSubjectId, selectedSubject]);

  /** Active (unrecorded) seconds in the currently open run. */
  const activeSeconds = useCallback((): number => {
    if (runStartRef.current === null) return 0;
    return Math.floor((Date.now() - runStartRef.current) / 1000);
  }, []);

  /** Displayed clock: everything recorded plus the open active run. */
  const displayedSeconds = useCallback((): number => {
    return recordedSeconds + pendingSeconds + activeSeconds();
  }, [recordedSeconds, pendingSeconds, activeSeconds]);

  const stopClockInterval = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  /**
   * Submit the open segment ("active" time since last resume) to the server.
   * On success the seconds move into `recorded`; on network failure they move
   * into the durable pending queue and surface as "pending sync" — never lost,
   * never double-counted (unique segmentId per submission).
   */
  const flushActiveSegment = useCallback(async (completed: boolean): Promise<void> => {
    const session = sessionRef.current;
    if (!session) return;
    const endedAtMs = Date.now();
    const duration = activeSeconds();
    const startedAt = segStartRef.current || new Date(endedAtMs - duration * 1000).toISOString();

    // Close the run immediately regardless of outcome — resuming opens a new
    // segment, so there is no path that submits these seconds twice.
    runStartRef.current = null;
    segStartRef.current = '';

    if (duration < MIN_SUBMIT_SECONDS) {
      // Too short to persist on its own; nothing recorded (spec: no fake saves).
      return;
    }

    try {
      const outcome = await session.submit({
        durationSeconds: duration,
        startedAt,
        endedAt: new Date(endedAtMs).toISOString(),
        completed,
      });
      if (outcome.pending) {
        setPendingSeconds((p) => p + duration);
      } else if (outcome.recorded && outcome.ack) {
        applyStatsFromAck(outcome.ack);
        if (outcome.ack.leveledUp && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('studyforge-levelup', { detail: { level: outcome.ack.stats.level } }));
        }
      }
    } catch {
      setPendingSeconds((p) => p + duration);
    }
  }, [activeSeconds, applyStatsFromAck]);

  const startTimer = () => {
    stopClockInterval();
    sessionRef.current = new StudySessionClient('stopwatch', getSubjectForSubmission);
    lapAnchorRef.current = 0;
    lapCounterRef.current = 0;
    sessionTotalsRef.current = { seconds: 0, xp: 0 };
    setLaps([]);
    setRecordedSeconds(0);
    runStartRef.current = Date.now();
    segStartRef.current = new Date().toISOString();
    setIsRunning(true);
    setIsPaused(false);
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 250);
  };

  const pauseTimer = async () => {
    stopClockInterval();
    setIsRunning(false);
    setIsPaused(true);
    await flushActiveSegment(false);
  };

  const resumeTimer = () => {
    stopClockInterval();
    runStartRef.current = Date.now();
    segStartRef.current = new Date().toISOString();
    setIsRunning(true);
    setIsPaused(false);
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 250);
  };

  /** Stop: submit remaining active time (completed=true) and close the session. */
  const stopTimer = async () => {
    stopClockInterval();
    setIsRunning(false);
    setIsPaused(false);
    await flushActiveSegment(true);
    sessionRef.current = null;
    if (sessionTotalsRef.current.seconds > 0 || sessionTotalsRef.current.xp > 0) {
      setShowSummary({ ...sessionTotalsRef.current });
    }
  };

  const recordLap = () => {
    if (!isRunning) return;
    const elapsed = displayedSeconds();
    const lapTime = elapsed - lapAnchorRef.current;
    lapAnchorRef.current = elapsed;
    lapCounterRef.current += 1;
    setLaps((prev) => [{ id: lapCounterRef.current, time: lapTime }, ...prev]);
  };

  // Lifecycle safety net (spec #14): never rely on beforeunload alone.
  useEffect(() => {
    const activeDuration = () =>
      runStartRef.current === null ? 0 : Math.floor((Date.now() - runStartRef.current) / 1000);

    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return;
      const session = sessionRef.current;
      const duration = activeDuration();
      if (!session || duration < MIN_SUBMIT_SECONDS) return;
      const startedAt = segStartRef.current || new Date(Date.now() - duration * 1000).toISOString();
      // Close the run so a later resume opens a fresh segment (no double count).
      runStartRef.current = null;
      segStartRef.current = '';
      session.submit({ durationSeconds: duration, startedAt, completed: false })
        .then((outcome) => {
          if (outcome.pending) setPendingSeconds((p) => p + duration);
          else if (outcome.recorded && outcome.ack) applyStatsFromAck(outcome.ack);
        })
        .catch(() => setPendingSeconds((p) => p + duration));
    };

    const onPageHide = () => {
      const session = sessionRef.current;
      const duration = activeDuration();
      if (!session || duration < MIN_SUBMIT_SECONDS) return;
      enqueuePendingSegment({
        segmentId: session.nextSegmentId(),
        sessionId: session.sessionId,
        mode: 'stopwatch',
        subjectId: selectedSubjectId || null,
        subjectName: selectedSubject?.name ?? null,
        startedAt: segStartRef.current || new Date(Date.now() - duration * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: duration,
        completed: false,
      });
    };

    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, selectedSubject?.name, applyStatsFromAck]);

  useEffect(() => () => {
    stopClockInterval();
    awardTimeoutRef.current && clearTimeout(awardTimeoutRef.current);
  }, []);

  const currentLapTime = displayedSeconds() - lapAnchorRef.current;
  const bestLap = laps.length > 0 ? laps.reduce((best, lap) => (lap.time < best.time ? lap : best), laps[0]) : null;
  const hasUnsavedWork =
    isRunning || isPaused || recordedSeconds > 0 || pendingSeconds > 0;

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

        {lastAward && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200 flex items-center justify-between">
            <span>
              Saved <span className="font-semibold">{formatTimeShort(lastAward.seconds)}</span> of study time
            </span>
            <span className="font-bold">+{lastAward.xp} XP</span>
          </div>
        )}
        {pendingSeconds > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
            {formatTimeShort(pendingSeconds)} pending sync — will be saved automatically when the connection recovers.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <div className="text-7xl md:text-8xl font-mono font-bold text-gray-900 dark:text-white tracking-wider mb-2">
                    {formatTime(displayedSeconds())}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    Recorded: {formatTime(recordedSeconds)}
                    {pendingSeconds > 0 && <> · Pending: {formatTime(pendingSeconds)}</>}
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
                    {formatTimeShort(displayedSeconds())}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Today</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {stats ? formatTimeShort(stats.todayStudySeconds) : '…'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">This Week</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {stats ? formatTimeShort(stats.weekStudySeconds) : '…'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total XP</span>
                  <Badge variant="success">{stats ? stats.totalXp : user.xp}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Level</span>
                  <Badge variant="info">{stats ? stats.level : user.level}</Badge>
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
                {pendingSeconds > 0 && (
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {formatTimeShort(pendingSeconds)} is still syncing and will be retried automatically.
                  </p>
                )}
                <Button
                  onClick={() => {
                    setShowSummary(null);
                    setRecordedSeconds(0);
                    sessionTotalsRef.current = { seconds: 0, xp: 0 };
                    setPendingSeconds(getPendingSegments().reduce((sum, s) => sum + s.durationSeconds, 0));
                    setLaps([]);
                    refreshUserStats().then(setStats);
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
