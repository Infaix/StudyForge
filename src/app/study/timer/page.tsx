'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, Button, Input, Badge } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { subjectStorage, studySessionStorage, userProfileStorage } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';

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

const PRESET_SUBJECTS = [
  'Maths Methods',
  'Physics',
  'English Language',
  'Software Development',
  'French',
  'Vietnamese',
  'Custom',
] as const;

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoStartBreaks: true,
  autoStartFocus: false,
  soundEnabled: true,
  sessionsBeforeLongBreak: 4,
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function formatTimeHMS(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function StudyTimer() {
  const { user } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedStopwatch, setElapsedStopwatch] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
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
  const [totalStudyTime, setTotalStudyTime] = useState(0);

  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopwatchStartRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef<number>(0);
  const settingsRef = useRef<PomodoroSettings>(settings);
  const pomodoroPhaseRef = useRef<PomodoroPhase>(pomodoroPhase);
  const pomodoroSessionRef = useRef<number>(pomodoroSession);
  const onTimerCompleteRef = useRef<(() => void) | null>(null);
  const handlePomodoroPhaseCompleteRef = useRef<() => void>(() => {});

  useEffect(() => {
    settingsRef.current = settings;
    pomodoroPhaseRef.current = pomodoroPhase;
    pomodoroSessionRef.current = pomodoroSession;
  });

  useEffect(() => {
    subjectStorage.getAll().then((subs) => {
      setSubjects(subs.map((s) => s.name));
    });
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
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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

  const recordStudySession = useCallback(
    async (durationSeconds: number) => {
      if (!user || durationSeconds <= 0 || !selectedSubject) return;
      const now = new Date().toISOString();
      const startTime = new Date(Date.now() - durationSeconds * 1000).toISOString();
      await studySessionStorage.create({
        id: generateId(),
        subjectId: selectedSubject,
        topicId: null,
        duration: Math.floor(durationSeconds / 60),
        startTime,
        endTime: now,
        notes: null,
      });
      try {
        const profile = await userProfileStorage.get(user.id);
        if (profile) {
          const minutes = Math.floor(durationSeconds / 60);
          await userProfileStorage.update({
            ...profile,
            studyTimeToday: profile.studyTimeToday + minutes,
            studyTimeThisWeek: profile.studyTimeThisWeek + minutes,
            studyTimeThisMonth: profile.studyTimeThisMonth + minutes,
            studyTimeAllTime: profile.studyTimeAllTime + minutes,
          });
        }
      } catch {
        // Profile update is non-critical
      }
    },
    [user, selectedSubject]
  );

  const startTimerInterval = useCallback(
    (durationSeconds: number) => {
      clearTimerInterval();
      setTotalTime(durationSeconds);
      setRemainingTime(durationSeconds);
      setIsRunning(true);
      setIsPaused(false);
      endTimeRef.current = Date.now() + durationSeconds * 1000;

      intervalRef.current = setInterval(() => {
        if (endTimeRef.current === null) return;
        const now = Date.now();
        const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
        setRemainingTime(left);
        if (left <= 0) {
          if (intervalRef.current !== null) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsRunning(false);
          setIsPaused(false);
          onTimerCompleteRef.current?.();
        }
      }, 250);
    },
    [clearTimerInterval]
  );

  const startStopwatchInterval = useCallback(() => {
    clearTimerInterval();
    setIsRunning(true);
    setIsPaused(false);
    stopwatchStartRef.current = Date.now() - pausedRemainingRef.current * 1000;

    intervalRef.current = setInterval(() => {
      if (stopwatchStartRef.current === null) return;
      const elapsed = (Date.now() - stopwatchStartRef.current) / 1000;
      setElapsedStopwatch(elapsed);
    }, 100);
  }, [clearTimerInterval]);

  const handlePomodoroPhaseComplete = useCallback(() => {
    const completedPhase = pomodoroPhaseRef.current;
    const completedSession = pomodoroSessionRef.current;

    playNotificationSound();

    if (completedPhase.type === 'focus') {
      setTotalStudyTime((p) => p + completedPhase.duration);
      setCompletedSessions((p) => p + 1);
      recordStudySession(completedPhase.duration);
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
      setTimeout(() => {
        onTimerCompleteRef.current = handlePomodoroPhaseCompleteRef.current;
        startTimerInterval(nextPhase.duration);
      }, 500);
    }
  }, [playNotificationSound, recordStudySession, startTimerInterval]);

  useEffect(() => {
    handlePomodoroPhaseCompleteRef.current = handlePomodoroPhaseComplete;
  });

  const handleCountdownComplete = useCallback(() => {
    playNotificationSound();
    setCompletedSessions((p) => p + 1);
    const duration = pomodoroPhaseRef.current.type === 'focus' ? pomodoroPhaseRef.current.duration : totalTime;
    setTotalStudyTime((p) => p + duration);
    recordStudySession(duration);
  }, [playNotificationSound, recordStudySession, totalTime]);

  const handleStart = useCallback(() => {
    if (!selectedSubject) return;

    if (timerMode === 'stopwatch') {
      pausedRemainingRef.current = elapsedStopwatch;
      startStopwatchInterval();
      return;
    }

    if (timerMode === 'countdown') {
      onTimerCompleteRef.current = handleCountdownComplete;
      startTimerInterval(countdownMinutes * 60);
      return;
    }

    if (timerMode === 'custom') {
      onTimerCompleteRef.current = handleCountdownComplete;
      startTimerInterval(customMinutes * 60);
      return;
    }

    if (timerMode === 'pomodoro') {
      onTimerCompleteRef.current = handlePomodoroPhaseComplete;
      startTimerInterval(pomodoroPhase.duration);
    }
  }, [
    selectedSubject,
    timerMode,
    elapsedStopwatch,
    startStopwatchInterval,
    startTimerInterval,
    countdownMinutes,
    customMinutes,
    pomodoroPhase,
    handleCountdownComplete,
    handlePomodoroPhaseComplete,
  ]);

  const handlePause = useCallback(() => {
    if (timerMode === 'stopwatch') {
      stopwatchStartRef.current = null;
    } else {
      if (endTimeRef.current !== null) {
        pausedRemainingRef.current = Math.max(0, (endTimeRef.current - Date.now()) / 1000);
      }
    }
    clearTimerInterval();
    setIsRunning(false);
    setIsPaused(true);
  }, [timerMode, clearTimerInterval]);

  const handleResume = useCallback(() => {
    if (timerMode === 'stopwatch') {
      startStopwatchInterval();
      return;
    }

    const remaining = pausedRemainingRef.current;
    setIsRunning(true);
    setIsPaused(false);
    endTimeRef.current = Date.now() + remaining * 1000;
    setRemainingTime(Math.ceil(remaining));

    intervalRef.current = setInterval(() => {
      if (endTimeRef.current === null) return;
      const now = Date.now();
      const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
      setRemainingTime(left);
      if (left <= 0) {
        if (intervalRef.current !== null) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
        setIsPaused(false);
        onTimerCompleteRef.current?.();
      }
    }, 250);
  }, [timerMode, startStopwatchInterval]);

  const handleReset = useCallback(() => {
    clearTimerInterval();
    onTimerCompleteRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
    stopwatchStartRef.current = null;
    endTimeRef.current = null;
    pausedRemainingRef.current = 0;
    setElapsedStopwatch(0);

    if (timerMode === 'stopwatch') {
      setRemainingTime(0);
      setTotalTime(0);
    } else if (timerMode === 'countdown') {
      const total = countdownMinutes * 60;
      setRemainingTime(total);
      setTotalTime(total);
    } else if (timerMode === 'custom') {
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
  }, [timerMode, countdownMinutes, customMinutes, settings.focusDuration, clearTimerInterval]);

  const handleModeChange = useCallback(
    (mode: TimerMode) => {
      clearTimerInterval();
      onTimerCompleteRef.current = null;
      setIsRunning(false);
      setIsPaused(false);
      stopwatchStartRef.current = null;
      endTimeRef.current = null;
      pausedRemainingRef.current = 0;
      setElapsedStopwatch(0);
      setTimerMode(mode);

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
    [clearTimerInterval, countdownMinutes, customMinutes, settings.focusDuration]
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
      return formatTimeHMS(Math.floor(elapsedStopwatch));
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
          {timerMode === 'stopwatch' && !isFS && (
            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isRunning ? 'Timing...' : isPaused ? 'Paused' : 'Ready'}
            </span>
          )}
        </div>
      </div>

      {selectedSubject && (
        <Badge variant="default" className={isFS ? 'text-base px-4 py-1' : ''}>
          {selectedSubject}
        </Badge>
      )}
    </div>
  );

  const renderControls = (isFS: boolean) => (
    <div className="flex items-center justify-center gap-3">
      {!isRunning && !isPaused && (
        <Button
          size={isFS ? 'lg' : 'md'}
          onClick={handleStart}
          disabled={!selectedSubject}
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
          onClick={handlePause}
          className={isFS ? 'px-8 py-4 text-lg' : ''}
        >
          Pause
        </Button>
      )}
      {(isRunning || isPaused) && (
        <Button
          size={isFS ? 'lg' : 'md'}
          variant="ghost"
          onClick={handleReset}
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

  const renderStats = () => (
    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Session Stats
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {completedSessions}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Sessions Completed
          </div>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {Math.floor(totalStudyTime / 60)}m
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Total Study Time
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
      </div>
    </div>
  );

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
        value={selectedSubject}
        onChange={(e) => setSelectedSubject(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
      >
        <option value="">Select a subject</option>
        {PRESET_SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        {subjects.length > 0 && <option disabled>{'──────────'}</option>}
        {subjects
          .filter((s) => !(PRESET_SUBJECTS as readonly string[]).includes(s))
          .map((s) => (
            <option key={s} value={s}>
              {s}
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
                  onClick={() => handleModeChange(key)}
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

            {!selectedSubject && (
              <p className="text-center text-sm text-amber-600 dark:text-amber-400 mt-4">
                Select a subject to start tracking your study session
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
