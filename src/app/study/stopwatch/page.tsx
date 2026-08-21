'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Badge } from '@/components/ui';
import { subjectStorage, studySessionStorage, userProfileStorage } from '@/lib/storage';
import { recordStudySessionComplete } from '@/lib/social/socialService';
import { calculateXpFromDuration } from '@/lib/server/xp';

const DEFAULT_SUBJECTS = [
  'Maths Methods',
  'Physics',
  'English Language',
  'Software Development',
  'French',
  'Vietnamese',
];

interface Lap {
  id: number;
  time: number;
  timestamp: number;
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
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadDailyStats(): Promise<{ totalTime: number; sessionCount: number }> {
  const today = getTodayKey();
  try {
    const res = await fetch('/api/data/study-sessions', { credentials: 'include' });
    if (!res.ok) return { totalTime: 0, sessionCount: 0 };
    const sessions: Array<{ startTime: string; duration: number }> = await res.json();
    const todaySessions = sessions.filter((s) => s.startTime && s.startTime.startsWith(today));
    return {
      totalTime: todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0) * 60,
      sessionCount: todaySessions.length,
    };
  } catch {
    return { totalTime: 0, sessionCount: 0 };
  }
}

async function loadWeekStats(): Promise<number> {
  const weekStart = getWeekStart();
  try {
    const res = await fetch('/api/data/study-sessions', { credentials: 'include' });
    if (!res.ok) return 0;
    const sessions: Array<{ startTime: string; duration: number }> = await res.json();
    return sessions
      .filter((s) => s.startTime && s.startTime >= weekStart)
      .reduce((sum, s) => sum + (s.duration || 0), 0) * 60;
  } catch {
    return 0;
  }
}

export default function StudyStopwatch() {
  const { user } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [totalTime, setTotalTime] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [currentLapStart, setCurrentLapStart] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Active study time tracking
  const [activeStudySeconds, setActiveStudySeconds] = useState(0);
  const [currentRunStartedAt, setCurrentRunStartedAt] = useState<number | null>(null);

  const [dailyStats, setDailyStats] = useState({ totalTime: 0, sessionCount: 0 });
  const [weeklyTotal, setWeeklyTotal] = useState(0);

  const startTimeRef = useRef<number | null>(null);
  const pausedElapsedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lapCounterRef = useRef<number>(0);
  const currentLapStartRef = useRef<number>(0);

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const stored = await subjectStorage.getAll();
        if (stored.length > 0) {
          setSubjects(stored.map((s) => s.name));
        }
      } catch {}
    };
    loadSubjects();
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      setDailyStats(await loadDailyStats());
      setWeeklyTotal(await loadWeekStats());
    };
    loadStats();
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const tick = () => {
    if (startTimeRef.current === null) return;
    const now = Date.now();
    // Only count active running time, not paused time
    const elapsed = (now - startTimeRef.current) / 1000 + pausedElapsedRef.current;
    setTotalTime(elapsed);
  };

  const startTimer = () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    startTimeRef.current = Date.now();
    pausedElapsedRef.current = 0;
    currentLapStartRef.current = 0;
    lapCounterRef.current = 0;
    setLaps([]);
    setCurrentLapStart(0);
    setIsRunning(true);
    setIsPaused(false);
    intervalRef.current = setInterval(tick, 50);
  };

  const pauseTimer = async () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    // Sync accumulated active study time on pause
    const now = Date.now();
    if (currentRunStartedAt !== null) {
      setActiveStudySeconds((p) => p + Math.floor((now - currentRunStartedAt) / 1000));
      setCurrentRunStartedAt(null);
    }
    // Immediately submit the newly accumulated study time
    if (activeStudySeconds > 0 && selectedSubject) {
      const minutes = Math.floor(activeStudySeconds / 60);
      try {
        const submissionResponse = await fetch('/api/study/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            durationSeconds: activeStudySeconds,
            subjectId: selectedSubject || undefined,
            subjectName: selectedSubject || 'Study',
            timerType: 'stopwatch',
            sessionId: `stopwatch-${Date.now()}`,
            startedAt: new Date(Date.now() - activeStudySeconds * 1000).toISOString(),
          }),
        });

        if (!submissionResponse.ok) {
          const errorData = await submissionResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to submit study session');
        }

        const result = await submissionResponse.json();

        // Update local state with server-authoritative data
        setActiveStudySeconds(0);
        setCurrentRunStartedAt(null);

        // Update XP and level from server response
        try {
          const profile = await userProfileStorage.get(user!.id);
          if (profile) {
            const updatedProfile = {
              ...profile,
              xp: result.stats.xp,
              level: result.stats.level,
              studyTimeToday: result.stats.totalStudySeconds > profile.studyTimeToday ? profile.studyTimeToday + minutes : profile.studyTimeToday,
              studyTimeThisWeek: profile.studyTimeThisWeek + minutes,
              studyTimeThisMonth: profile.studyTimeThisMonth + minutes,
              studyTimeAllTime: result.stats.totalStudySeconds,
            };
            await userProfileStorage.update(updatedProfile);
          }
        } catch {
          // Profile update is non-critical
        }
      } catch (err) {
        console.error('Failed to save session:', err);
      }
    }
    pausedElapsedRef.current = totalTime;
    setIsPaused(true);
    setIsRunning(false);
  };

  const resumeTimer = () => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    // Start new active run
    setCurrentRunStartedAt(Date.now());
    startTimeRef.current = Date.now();
    setIsRunning(true);
    setIsPaused(false);
    intervalRef.current = setInterval(tick, 50);
  };

  const resetTimer = () => {
    // Finalize any remaining running interval
    const now = Date.now();
    if (currentRunStartedAt !== null) {
      setActiveStudySeconds((p) => p + Math.floor((now - currentRunStartedAt) / 1000));
      setCurrentRunStartedAt(null);
    }

    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    const sessionTime = totalTime;
    setIsRunning(false);
    setIsPaused(false);
    setTotalTime(0);
    setLaps([]);
    setCurrentLapStart(0);
    startTimeRef.current = null;
    pausedElapsedRef.current = 0;
    currentLapStartRef.current = 0;
    lapCounterRef.current = 0;

    if (sessionTime > 0.5) {
      loadDailyStats().then(setDailyStats);
      loadWeekStats().then(setWeeklyTotal);
      setShowSaveDialog(true);
    }
  };

  const recordLap = () => {
    if (!isRunning) return;
    const now = Date.now();
    const lapElapsed = (now - (startTimeRef.current ?? now)) / 1000 + pausedElapsedRef.current - currentLapStartRef.current;

    const newLap: Lap = {
      id: lapCounterRef.current + 1,
      time: lapElapsed,
      timestamp: Date.now(),
    };
    lapCounterRef.current += 1;
    currentLapStartRef.current = (now - (startTimeRef.current ?? now)) / 1000 + pausedElapsedRef.current;
    setCurrentLapStart(currentLapStartRef.current);
    setLaps((prev) => [newLap, ...prev]);
  };

  const currentLapTime = isRunning
    ? totalTime - currentLapStart
    : isPaused
    ? totalTime - currentLapStart
    : 0;

  const bestLap = laps.length > 0 ? laps.reduce((best, lap) => (lap.time < best.time ? lap : best), laps[0]) : null;

  const handleSaveSession = async () => {
    if (!user) return;
    // Use activeStudySeconds (excludes paused time) instead of totalTime
    const durationSeconds = activeStudySeconds;
    const minutes = Math.floor(durationSeconds / 60);
    try {
      const submissionResponse = await fetch('/api/study/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          durationSeconds: durationSeconds,
          subjectId: selectedSubject || undefined,
          subjectName: selectedSubject || 'Study',
          timerType: 'stopwatch',
          sessionId: `stopwatch-${Date.now()}`,
          startedAt: durationSeconds > 0 ? new Date(Date.now() - durationSeconds * 1000).toISOString() : new Date().toISOString(),
        }),
      });

      if (!submissionResponse.ok) {
        const errorData = await submissionResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit study session');
      }

      const result = await submissionResponse.json();

      // Update local state with server-authoritative data
      setActiveStudySeconds(0);
      setCurrentRunStartedAt(null);

      // Update XP and level from server response
      try {
        const profile = await userProfileStorage.get(user!.id);
        if (profile) {
          const updatedProfile = {
            ...profile,
            xp: result.stats.xp,
            level: result.stats.level,
            studyTimeToday: result.stats.totalStudySeconds > profile.studyTimeToday ? profile.studyTimeToday + minutes : profile.studyTimeToday,
            studyTimeThisWeek: profile.studyTimeThisWeek + minutes,
            studyTimeThisMonth: profile.studyTimeThisMonth + minutes,
            studyTimeAllTime: result.stats.totalStudySeconds,
          };
          await userProfileStorage.update(updatedProfile);
        }
      } catch {
        // Profile update is non-critical
      }
    } catch (err) {
      console.error('Failed to save session:', err);
    }
    setShowSaveDialog(false);
    loadDailyStats().then(setDailyStats);
    loadWeekStats().then(setWeeklyTotal);
  };

  const handleDiscardSession = () => {
    setShowSaveDialog(false);
  };

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Study Stopwatch
          </h1>
          {selectedSubject && (
            <Badge variant="info">{selectedSubject}</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <div className="text-7xl md:text-8xl font-mono font-bold text-gray-900 dark:text-white tracking-wider mb-2">
                    {formatTime(totalTime)}
                  </div>
                  {isRunning && (
                    <div className="text-lg font-mono text-blue-600 dark:text-blue-400">
                      Lap: {formatTime(currentLapTime)}
                    </div>
                  )}
                  {isPaused && (
                    <div className="text-lg font-mono text-yellow-600 dark:text-yellow-400">
                      Paused
                    </div>
                  )}
                  {!isRunning && !isPaused && (
                    <div className="text-lg text-gray-400 dark:text-gray-500">
                      Ready
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-3">
              {!isRunning && !isPaused && (
                <Button
                  onClick={startTimer}
                  variant="primary"
                  size="lg"
                  className="col-span-3"
                >
                  Start
                </Button>
              )}
              {isRunning && (
                <>
                  <Button
                    onClick={pauseTimer}
                    variant="secondary"
                    size="lg"
                  >
                    Pause
                  </Button>
                  <Button
                    onClick={recordLap}
                    variant="ghost"
                    size="lg"
                  >
                    Lap
                  </Button>
                  <Button
                    onClick={resetTimer}
                    variant="ghost"
                    size="lg"
                  >
                    Reset
                  </Button>
                </>
              )}
              {isPaused && (
                <>
                  <Button
                    onClick={resumeTimer}
                    variant="primary"
                    size="lg"
                  >
                    Resume
                  </Button>
                  <Button
                    onClick={recordLap}
                    variant="ghost"
                    size="lg"
                    disabled
                  >
                    Lap
                  </Button>
                  <Button
                    onClick={resetTimer}
                    variant="ghost"
                    size="lg"
                  >
                    Reset
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
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed text-base"
                >
                  <option value="">Select a subject</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
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
                    {formatTimeShort(totalTime)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Today</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {formatTimeShort(dailyStats.totalTime)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Sessions Today</span>
                  <Badge variant="success">{dailyStats.sessionCount}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">This Week</span>
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {formatTimeShort(weeklyTotal)}
                  </span>
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

        {showSaveDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Save Session?
                </h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  You studied for <span className="font-semibold text-gray-900 dark:text-white">{formatTimeShort(totalTime)}</span>
                  {selectedSubject && (
                    <> in <span className="font-semibold text-gray-900 dark:text-white">{selectedSubject}</span></>
                  )}
                  . Would you like to save this session?
                </p>
                {laps.length > 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {laps.length} lap{laps.length !== 1 ? 's' : ''} recorded
                    {bestLap && <> — best: {formatTime(bestLap.time)}</>}
                  </p>
                )}
                <div className="flex gap-3">
                  <Button onClick={handleSaveSession} variant="primary" className="flex-1">
                    Save Session
                  </Button>
                  <Button onClick={handleDiscardSession} variant="ghost" className="flex-1">
                    Discard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
