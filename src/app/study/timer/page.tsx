'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, Button, Input, Badge } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { subjectStorage } from '@/lib/storage';
import { Subject } from '@/types';
import { useAuth, useLivePageRefresh } from '@/contexts/AuthContext';
import { useStudyTimeSync } from '@/lib/client/useStudyTimeSync';

type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro' | 'custom';

interface PomodoroSettings {
  focusDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  sessionsBeforeLongBreak: number;
}

interface PomodoroPhase {
  type: 'focus' | 'shortBreak' | 'longBreak';
  duration: number;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoStartBreaks: true,
  autoStartFocus: false,
  soundEnabled: true,
  sessionsBeforeLongBreak: 4,
};

function formatTimeHMS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatMinutes(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export default function StudyTimer() {
  const { user } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedStopwatch, setElapsedStopwatch] = useState(0);
  const [remainingTime, setRemainingTime] = useState(DEFAULT_SETTINGS.focusDuration * 60);
  const [totalTime, setTotalTime] = useState(DEFAULT_SETTINGS.focusDuration * 60);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(30);
  const [countdownMinutes, setCountdownMinutes] = useState(25);

  const [settings, setSettings] = useState<PomodoroSettings>({ ...DEFAULT_SETTINGS });
  const [pomodoroSession, setPomodoroSession] = useState(1);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>({
    type: 'focus',
    duration: DEFAULT_SETTINGS.focusDuration * 60,
  });
  const [completedSessions, setCompletedSessions] = useState(0);

  const settingsRef = useRef<PomodoroSettings>(settings);
  const pomodoroPhaseRef = useRef<PomodoroPhase>(pomodoroPhase);
  const pomodoroSessionRef = useRef<number>(pomodoroSession);
  const onTimerCompleteRef = useRef<(() => void) | null>(null);
  const handlePomodoroPhaseCompleteRef = useRef<() => void>(() => {});
  const endTimeRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef<number>(0);
  const stopwatchStartRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
    pomodoroPhaseRef.current = pomodoroPhase;
    pomodoroSessionRef.current = pomodoroSession;
  });

  useEffect(() => {
    subjectStorage.getAll().then(setSubjects).catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) || null;

  // All persistence concerns live in the shared hook (spec #26): segment
  // submission, idempotency, checkpoints, refresh recovery, offline queue,
  // lifecycle handlers and server-authoritative stat sync.
  const sync = useStudyTimeSync({
    mode: timerMode,
    getSubject: useCallback(
      () => ({ id: selectedSubjectId || undefined, name: selectedSubject?.name ?? null }),
      [selectedSubjectId, selectedSubject]
    ),
  });

  // Returning to this tab/page re-syncs stats read-only (never creates
  // records) so the panel never shows stale values after bfcache restore.
  useLivePageRefresh(() => {
    void sync.refreshStatsNow();
  });

  const playNotificationSound = useCallback(() => {
    if (!settingsRef.current.soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio not available
    }
  }, []);

  /**
   * Drive a countdown-style interval. `track` is true only for time that
   * generates study time — pomodoro breaks never open a run (#13).
   */
  const startInterval = useCallback(
    (durationSeconds: number, track: boolean) => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      setRemainingTime(durationSeconds);
      setIsRunning(true);
      setIsPaused(false);
      endTimeRef.current = Date.now() + durationSeconds * 1000;
      if (track) sync.openRun();

      intervalRef.current = setInterval(() => {
        if (endTimeRef.current === null) return;
        const now = Date.now();
        const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
        setRemainingTime(left);
        if (left <= 0) {
          if (intervalRef.current !== null) clearInterval(intervalRef.current);
          intervalRef.current = null;
          const cb = onTimerCompleteRef.current;
          cb?.();
        }
      }, 250);
    },
    [sync]
  );

  const startStopwatchInterval = useCallback(() => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    setIsRunning(true);
    setIsPaused(false);
    stopwatchStartRef.current = Date.now() - elapsedStopwatch * 1000;
    sync.openRun();
    intervalRef.current = setInterval(() => {
      if (stopwatchStartRef.current === null) return;
      setElapsedStopwatch((Date.now() - stopwatchStartRef.current) / 1000);
    }, 100);
  }, [elapsedStopwatch, sync]);

  const handlePomodoroPhaseComplete = useCallback(() => {
    const completedPhase = pomodoroPhaseRef.current;
    const completedSession = pomodoroSessionRef.current;

    playNotificationSound();

    if (completedPhase.type === 'focus') {
      setCompletedSessions((p) => p + 1);
      // Persist the actual work interval immediately; breaks never count (#13).
      void sync.flushActive(true);
    }

    const s = settingsRef.current;
    let nextPhase: PomodoroPhase;
    let nextSession = completedSession;

    if (completedPhase.type === 'focus') {
      nextSession = completedSession + 1;
      setPomodoroSession(nextSession);
      pomodoroSessionRef.current = nextSession;
      nextPhase =
        nextSession % s.sessionsBeforeLongBreak === 0
          ? { type: 'longBreak', duration: s.longBreakDuration * 60 }
          : { type: 'shortBreak', duration: s.shortBreakDuration * 60 };
    } else {
      nextPhase = { type: 'focus', duration: s.focusDuration * 60 };
    }

    setPomodoroPhase(nextPhase);
    pomodoroPhaseRef.current = nextPhase;
    setRemainingTime(nextPhase.duration);
    setTotalTime(nextPhase.duration);

    const shouldAutoStart =
      completedPhase.type === 'focus' ? s.autoStartBreaks : s.autoStartFocus;

    if (shouldAutoStart) {
      // Break time must NOT generate study time; focus resumes a new segment.
      const track = nextPhase.type === 'focus';
      setTimeout(() => {
        onTimerCompleteRef.current = handlePomodoroPhaseCompleteRef.current;
        startInterval(nextPhase.duration, track);
      }, 500);
    }
  }, [playNotificationSound, sync, startInterval]);

  useEffect(() => {
    handlePomodoroPhaseCompleteRef.current = handlePomodoroPhaseComplete;
  });

  const handleCountdownComplete = useCallback(async () => {
    playNotificationSound();
    setCompletedSessions((p) => p + 1);
    // Natural finish: submit the final unrecorded segment, mark completed.
    // Idempotent segmentIds mean a retried completion cannot award twice.
    await sync.flushActive(true);
  }, [playNotificationSound, sync]);

  const handleStart = useCallback(() => {
    sync.beginSession();

    if (timerMode === 'stopwatch') {
      startStopwatchInterval();
      return;
    }

    if (timerMode === 'countdown') {
      onTimerCompleteRef.current = () => void handleCountdownComplete();
      startInterval(countdownMinutes * 60, true);
      return;
    }

    if (timerMode === 'custom') {
      onTimerCompleteRef.current = () => void handleCountdownComplete();
      startInterval(customMinutes * 60, true);
      return;
    }

    // Pomodoro: only focus phases track study time.
    const isFocus = pomodoroPhaseRef.current.type === 'focus';
    onTimerCompleteRef.current = handlePomodoroPhaseComplete;
    startInterval(pomodoroPhaseRef.current.duration, isFocus);
  }, [
    timerMode,
    sync,
    startStopwatchInterval,
    startInterval,
    countdownMinutes,
    customMinutes,
    handleCountdownComplete,
    handlePomodoroPhaseComplete,
  ]);

  /** Pause: immediately submit newly elapsed active time (spec #6). */
  const handlePause = useCallback(async () => {
    if (timerMode === 'stopwatch') {
      stopwatchStartRef.current = null;
    } else if (endTimeRef.current !== null) {
      pausedRemainingRef.current = Math.max(0, (endTimeRef.current - Date.now()) / 1000);
    }
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
    await sync.pauseAndFlush();
    setIsRunning(false);
    setIsPaused(true);
  }, [timerMode, sync]);

  const handleResume = useCallback(() => {
    if (timerMode === 'stopwatch') {
      startStopwatchInterval();
      return;
    }

    const remaining = pausedRemainingRef.current;
    // Break phases resume without tracking; everything else opens a new
    // segment so resumed time can never be submitted twice (#7).
    const track = timerMode !== 'pomodoro' || pomodoroPhaseRef.current.type === 'focus';
    setIsRunning(true);
    setIsPaused(false);
    endTimeRef.current = Date.now() + remaining * 1000;
    setRemainingTime(Math.ceil(remaining));
    if (track) sync.resumeRun();

    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (endTimeRef.current === null) return;
      const now = Date.now();
      const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
      setRemainingTime(left);
      if (left <= 0) {
        if (intervalRef.current !== null) clearInterval(intervalRef.current);
        intervalRef.current = null;
        onTimerCompleteRef.current?.();
      }
    }, 250);
  }, [timerMode, startStopwatchInterval, sync]);

  const resetDisplayState = useCallback(
    (mode: TimerMode) => {
      stopwatchStartRef.current = null;
      endTimeRef.current = null;
      pausedRemainingRef.current = 0;
      setElapsedStopwatch(0);

      if (mode === 'stopwatch') {
        setRemainingTime(0);
        setTotalTime(0);
      } else if (mode === 'countdown') {
        const total = countdownMinutes * 60;
        setRemainingTime(total);
        setTotalTime(total);
      } else if (mode === 'custom') {
        const total = customMinutes * 60;
        setRemainingTime(total);
        setTotalTime(total);
      } else {
        const total = settings.focusDuration * 60;
        setRemainingTime(total);
        setTotalTime(total);
        setPomodoroSession(1);
        setPomodoroPhase({ type: 'focus', duration: total });
        pomodoroSessionRef.current = 1;
        pomodoroPhaseRef.current = { type: 'focus', duration: total };
      }
    },
    [countdownMinutes, customMinutes, settings.focusDuration]
  );

  const handleReset = useCallback(async () => {
    // Flush open active time uncompleted so nothing studied is lost, then
    // abandon the session without marking anything complete.
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
    onTimerCompleteRef.current = null;
    await sync.pauseAndFlush();
    sync.endSession();
    setIsRunning(false);
    setIsPaused(false);
    resetDisplayState(timerMode);
  }, [timerMode, sync, resetDisplayState]);

  const handleModeChange = useCallback(
    async (mode: TimerMode) => {
      // Switching modes ends the current session cleanly first.
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      intervalRef.current = null;
      onTimerCompleteRef.current = null;
      await sync.stopAndClose();
      setIsRunning(false);
      setIsPaused(false);
      setTimerMode(mode);
      resetDisplayState(mode);
    },
    [sync, resetDisplayState]
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen not supported or blocked
    }
  }, []);

  const getProgress = (): number => {
    if (timerMode === 'stopwatch') {
      return totalTime > 0 ? Math.min(1, elapsedStopwatch / totalTime) : 0;
    }
    if (totalTime === 0) return 0;
    return 1 - remainingTime / totalTime;
  };

  const getDisplayTime = (): string => {
    if (timerMode === 'stopwatch') {
      return formatTimeHMS(elapsedStopwatch);
    }
    return formatTimeHMS(remainingTime);
  };

  const getPhaseLabel = (): string => {
    if (timerMode === 'pomodoro') {
      if (pomodoroPhase.type === 'focus') return 'Focus Session';
      if (pomodoroPhase.type === 'shortBreak') return 'Short Break';
      return 'Long Break';
    }
    return '';
  };

  const circumference = 2 * Math.PI * 112;
  const progress = getProgress();
  const displayTime = getDisplayTime();
  const phaseLabel = getPhaseLabel();

  const timerColor = (() => {
    if (timerMode === 'pomodoro') {
      if (pomodoroPhase.type === 'focus') return '#3b82f6';
      if (pomodoroPhase.type === 'shortBreak') return '#22c55e';
      return '#a855f7';
    }
    return '#3b82f6';
  })();

  const renderTimerDisplay = (isFS: boolean) => (
    <div className={`flex flex-col items-center ${isFS ? 'gap-8' : 'gap-4'}`}>
      {timerMode === 'pomodoro' && (
        <div className="flex items-center gap-3">
          <Badge variant="info">
            Session {pomodoroSession}/{settings.sessionsBeforeLongBreak}
          </Badge>
          <Badge variant={pomodoroPhase.type === 'focus' ? 'default' : 'success'}>
            {phaseLabel}
          </Badge>
        </div>
      )}

      <div className="relative">
        <svg
          className={`-rotate-90 ${isFS ? 'w-80 h-80' : 'w-64 h-64'}`}
          viewBox="0 0 256 256"
        >
          <circle
            cx="128"
            cy="128"
            r="112"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-200 dark:text-gray-700"
          />
          <circle
            cx="128"
            cy="128"
            r="112"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={
              circumference * (1 - (timerMode === 'stopwatch' && totalTime === 0 ? 0 : progress))
            }
            style={{ stroke: timerColor, transition: 'stroke-dashoffset 0.25s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-mono font-bold text-gray-900 dark:text-white ${
              isFS ? 'text-8xl' : 'text-5xl'
            }`}
          >
            {displayTime}
          </span>
          {(timerMode === 'stopwatch' || isFS) && (
            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isRunning ? 'Timing...' : isPaused ? 'Paused' : 'Ready'}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="font-mono text-sm text-gray-600 dark:text-gray-300">
          Studied: {formatMinutes(sync.studiedSeconds())}
          <span className="text-gray-400 dark:text-gray-500">
            {' '}· recorded {formatMinutes(sync.recordedSeconds)}
            {sync.pendingSeconds > 0 && <> · pending {formatMinutes(sync.pendingSeconds)}</>}
          </span>
        </div>
        {selectedSubject && (
          <Badge variant="default" className={isFS ? 'text-base px-4 py-1' : ''}>
            {selectedSubject.name}
          </Badge>
        )}
      </div>
    </div>
  );

  const renderControls = (isFS: boolean) => (
    <div className="flex items-center justify-center gap-3">
      {!isRunning && !isPaused && (
        <Button
          size={isFS ? 'lg' : 'md'}
          onClick={handleStart}
          className={isFS ? 'px-8 py-4 text-lg' : ''}
        >
          {timerMode === 'pomodoro' && pomodoroPhase.type !== 'focus' ? 'Start Break' : 'Start'}
        </Button>
      )}
      {!isRunning && isPaused && (
        <Button
          size={isFS ? 'lg' : 'md'}
          onClick={handleResume}
          className={isFS ? 'px-8 py-4 text-lg' : ''}
        >
          Resume
        </Button>
      )}
      {isRunning && (
        <Button
          size={isFS ? 'lg' : 'md'}
          variant="secondary"
          onClick={() => void handlePause()}
          className={isFS ? 'px-8 py-4 text-lg' : ''}
        >
          Pause
        </Button>
      )}
      {(isRunning || isPaused) && (
        <Button
          size={isFS ? 'lg' : 'md'}
          variant="ghost"
          onClick={() => void handleReset()}
          className={isFS ? 'px-8 py-4 text-lg' : ''}
        >
          Reset
        </Button>
      )}
    </div>
  );

  const renderFullscreenUI = () => (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col items-center justify-center gap-10">
      <button
        onClick={toggleFullscreen}
        className="absolute top-6 right-6 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        aria-label="Exit fullscreen"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
          />
        </svg>
      </button>
      {renderTimerDisplay(true)}
      {renderControls(true)}
      <button
        onClick={toggleFullscreen}
        className="absolute bottom-6 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        Press Esc or click to exit fullscreen
      </button>
    </div>
  );

  const renderModeSettings = () => {
    if (timerMode === 'countdown') {
      return (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Duration:
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={countdownMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                const clamped = Math.max(1, Math.min(720, val));
                setCountdownMinutes(clamped);
                if (!isRunning && !isPaused) {
                  setRemainingTime(clamped * 60);
                  setTotalTime(clamped * 60);
                }
              }}
              min={1}
              max={720}
              className="w-20"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">min</span>
          </div>
        </div>
      );
    }

    if (timerMode === 'custom') {
      return (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Duration:
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={customMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                const clamped = Math.max(1, Math.min(1440, val));
                setCustomMinutes(clamped);
                if (!isRunning && !isPaused) {
                  setRemainingTime(clamped * 60);
                  setTotalTime(clamped * 60);
                }
              }}
              min={1}
              max={1440}
              className="w-20"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">min</span>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderStats = () => {
    // '…' is reserved for a genuinely in-flight first stats load. Once the
    // load has completed we always render real numbers: server-authoritative
    // values when available, otherwise the synced context values.
    const statsLoading = !sync.statsLoaded;
    const stats = sync.stats;
    // Completed work units: server count (finished countdowns / pomodoro
    // focus units) merged with this sitting's local counter so unacked units
    // are never undercounted mid-session.
    const sessionsCompleted = stats
      ? Math.max(stats.completedSessionCount, completedSessions)
      : completedSessions;
    return (
    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Session Stats
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {sessionsCompleted}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Sessions Completed
          </div>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatMinutes(sync.studiedSeconds())}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            This Session
          </div>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {timerMode === 'pomodoro'
              ? `${pomodoroSession}/${settings.sessionsBeforeLongBreak}`
              : '--'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Pomodoro Cycle
          </div>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {statsLoading
              ? '…'
              : stats
                ? formatMinutes(stats.todayStudySeconds)
                : formatMinutes((user?.studyTimeToday ?? 0) * 60)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Today</div>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {statsLoading ? '…' : (stats?.totalXp ?? user?.xp ?? 0)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total XP</div>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {statsLoading ? '…' : `Level ${stats?.level ?? user?.level ?? 1}`}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stats ? `${stats.progressPercent.toFixed(0)}% to next` : ''}
          </div>
        </div>
      </div>
    </div>
    );
  };

  const renderSettingsPanel = () => (
    <Dialog isOpen={showSettings} onClose={() => setShowSettings(false)} title="Timer Settings">
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Pomodoro Durations
          </h4>
          <div className="space-y-3">
            <Input
              label="Focus Duration (min)"
              type="number"
              value={settings.focusDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setSettings((s) => ({ ...s, focusDuration: Math.max(1, Math.min(120, val)) }));
              }}
              min={1}
              max={120}
            />
            <Input
              label="Short Break Duration (min)"
              type="number"
              value={settings.shortBreakDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setSettings((s) => ({
                  ...s,
                  shortBreakDuration: Math.max(1, Math.min(30, val)),
                }));
              }}
              min={1}
              max={30}
            />
            <Input
              label="Long Break Duration (min)"
              type="number"
              value={settings.longBreakDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setSettings((s) => ({
                  ...s,
                  longBreakDuration: Math.max(1, Math.min(60, val)),
                }));
              }}
              min={1}
              max={60}
            />
            <Input
              label="Sessions Before Long Break"
              type="number"
              value={settings.sessionsBeforeLongBreak}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setSettings((s) => ({
                  ...s,
                  sessionsBeforeLongBreak: Math.max(1, Math.min(10, val)),
                }));
              }}
              min={1}
              max={10}
            />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Automation
          </h4>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Auto-start breaks
              </span>
              <button
                onClick={() => setSettings((s) => ({ ...s, autoStartBreaks: !s.autoStartBreaks }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.autoStartBreaks ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoStartBreaks ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Auto-start focus sessions
              </span>
              <button
                onClick={() => setSettings((s) => ({ ...s, autoStartFocus: !s.autoStartFocus }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.autoStartFocus ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoStartFocus ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">Sound</span>
              <button
                onClick={() => setSettings((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.soundEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>
    </Dialog>
  );

  const renderSubjectSelector = () => (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Subject
      </label>
      <select
        value={selectedSubjectId}
        onChange={(e) => setSelectedSubjectId(e.target.value)}
        disabled={isRunning}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">No subject</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Study Timer</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track your study sessions with precision
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label="Fullscreen"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
          </div>
        </div>

        {sync.lastAward && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200 flex items-center justify-between">
            <span>
              Saved <span className="font-semibold">{formatMinutes(sync.lastAward.seconds)}</span> of study time
            </span>
            <span className="font-bold">+{sync.lastAward.xp} XP</span>
          </div>
        )}
        {sync.pendingSeconds > 0 && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
            {formatMinutes(sync.pendingSeconds)} pending sync — will save automatically when the connection recovers.
          </div>
        )}

        <Card>
          <CardContent className="py-8">
            <div className="flex items-center gap-1 mb-8 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {(
                [
                  { key: 'stopwatch', label: 'Stopwatch' },
                  { key: 'countdown', label: 'Countdown' },
                  { key: 'pomodoro', label: 'Pomodoro' },
                  { key: 'custom', label: 'Custom' },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => void handleModeChange(key)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                    timerMode === key
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {renderSubjectSelector()}
            {renderModeSettings()}

            <div className="flex justify-center mb-8">{renderTimerDisplay(false)}</div>
            <div className="flex justify-center mb-4">{renderControls(false)}</div>

            {subjects.length === 0 && (
              <p className="text-center text-sm text-amber-600 dark:text-amber-400 mt-4">
                Tip: create subjects to attribute your study time per subject.
              </p>
            )}

            {renderStats()}
          </CardContent>
        </Card>

        {renderSettingsPanel()}
      </div>

      {isFullscreen && renderFullscreenUI()}
    </DashboardLayout>
  );
}
