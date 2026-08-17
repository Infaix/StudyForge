'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button, Card, CardContent, CardHeader, Input, EmptyState, PageHeader, Badge } from '@/components/ui';
import { subjectStorage, topicStorage, studySessionStorage } from '@/lib/storage';
import { Subject, Topic } from '@/types';

type TimerMode = 'pomodoro' | 'shortBreak' | 'longBreak' | 'custom';

const TIMER_DURATIONS: Record<TimerMode, number> = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  custom: 0,
};

const MODE_LABELS: Record<TimerMode, string> = {
  pomodoro: 'Pomodoro',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
  custom: 'Custom',
};

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch {}
}

export default function FocusPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(30);
  const [totalSeconds, setTotalSeconds] = useState(TIMER_DURATIONS.pomodoro);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMER_DURATIONS.pomodoro);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [showSetup, setShowSetup] = useState(true);
  const [completedSessions, setCompletedSessions] = useState(0);

  const endTimeRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    subjectStorage.getAll().then(setSubjects);
  }, []);

  useEffect(() => {
    if (selectedSubjectId) {
      topicStorage.getBySubject(selectedSubjectId).then(setTopics);
      setSelectedTopicId('');
    } else {
      setTopics([]);
    }
  }, [selectedSubjectId]);

  const handleTimerComplete = useCallback(async () => {
    if (timerMode === 'pomodoro') {
      const now = new Date();
      const start = new Date(now.getTime() - totalSeconds * 1000);
      await studySessionStorage.create({
        id: crypto.randomUUID(),
        subjectId: selectedSubjectId,
        topicId: selectedTopicId || null,
        duration: Math.round(totalSeconds / 60),
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        notes: null,
      });
      setCompletedSessions((p) => p + 1);
      setPomodoroCount((p) => p + 1);
    }
  }, [timerMode, totalSeconds, selectedSubjectId, selectedTopicId]);

  const tick = useCallback(() => {
    if (!endTimeRef.current) return;
    const now = Date.now();
    const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
    setRemainingSeconds(left);
    if (left <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      endTimeRef.current = null;
      setIsRunning(false);
      setIsPaused(false);
      playBeep();
      handleTimerComplete();
    }
  }, [handleTimerComplete]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startTimer = (seconds: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setIsRunning(true);
    setIsPaused(false);
    endTimeRef.current = Date.now() + seconds * 1000;
    intervalRef.current = setInterval(tick, 250);
  };

  const handleStart = () => {
    if (!selectedSubjectId) return;
    const duration = timerMode === 'custom' ? customMinutes * 60 : TIMER_DURATIONS[timerMode];
    setShowSetup(false);
    startTimer(duration);
  };

  const handlePause = () => {
    if (!isRunning || isPaused) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    pausedRemainingRef.current = remainingSeconds;
    endTimeRef.current = null;
    setIsPaused(true);
  };

  const handleResume = () => {
    if (!isPaused) return;
    endTimeRef.current = Date.now() + pausedRemainingRef.current * 1000;
    intervalRef.current = setInterval(tick, 250);
    setIsPaused(false);
  };

  const handleReset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    endTimeRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
    setShowSetup(true);
    const duration = timerMode === 'custom' ? customMinutes * 60 : TIMER_DURATIONS[timerMode];
    setRemainingSeconds(duration);
    setTotalSeconds(duration);
  };

  const handleModeChange = (mode: TimerMode) => {
    if (isRunning) return;
    setTimerMode(mode);
    const duration = mode === 'custom' ? customMinutes * 60 : TIMER_DURATIONS[mode];
    setTotalSeconds(duration);
    setRemainingSeconds(duration);
  };

  const handleCustomChange = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0 && n <= 180) {
      setCustomMinutes(n);
      if (timerMode === 'custom') {
        setTotalSeconds(n * 60);
        setRemainingSeconds(n * 60);
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  const getLongBreakEvery = () => {
    return pomodoroCount > 0 && pomodoroCount % 4 === 0;
  };

  const progressColor =
    timerMode === 'pomodoro'
      ? 'bg-blue-600'
      : timerMode === 'shortBreak'
        ? 'bg-green-500'
        : timerMode === 'longBreak'
          ? 'bg-purple-500'
          : 'bg-amber-500';

  const ringColor =
    timerMode === 'pomodoro'
      ? 'stroke-blue-600'
      : timerMode === 'shortBreak'
        ? 'stroke-green-500'
        : timerMode === 'longBreak'
          ? 'stroke-purple-500'
          : 'stroke-amber-500';

  if (subjects.length === 0) {
    return (
      <DashboardLayout>
        <PageHeader title="Focus" description="Stay focused with Pomodoro timers and concentration tools" />
        <EmptyState
          icon={<span className="text-6xl">🎯</span>}
          title="No subjects yet"
          description="Create a subject first to start tracking your focus sessions."
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Focus"
        description="Stay focused with Pomodoro timers and concentration tools"
        action={
          completedSessions > 0 ? (
            <Badge variant="success">
              {completedSessions} session{completedSessions !== 1 ? 's' : ''} completed
            </Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="flex flex-col items-center py-10">
              {!showSetup && selectedSubject && (
                <div className="mb-6 flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedSubject.colour }}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedSubject.name}
                  </span>
                  {selectedTopicId && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      — {topics.find((t) => t.id === selectedTopicId)?.name}
                    </span>
                  )}
                </div>
              )}

              <div className="relative w-64 h-64 mb-8">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 256 256">
                  <circle
                    cx="128"
                    cy="128"
                    r="112"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-gray-200 dark:text-gray-700"
                  />
                  <circle
                    cx="128"
                    cy="128"
                    r="112"
                    fill="none"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 112}
                    strokeDashoffset={2 * Math.PI * 112 * (1 - progressPercent / 100)}
                    className={`${ringColor} transition-[stroke-dashoffset] duration-300 ease-out`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-mono font-bold text-gray-900 dark:text-white">
                    {formatTime(remainingSeconds)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {MODE_LABELS[timerMode]}
                  </span>
                </div>
              </div>

              {showSetup ? (
                <div className="w-full max-w-sm space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Timer Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(MODE_LABELS) as TimerMode[]).map((mode) => (
                        <Button
                          key={mode}
                          variant={timerMode === mode ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => handleModeChange(mode)}
                        >
                          {MODE_LABELS[mode]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {timerMode === 'custom' && (
                    <Input
                      label="Minutes"
                      type="number"
                      min={1}
                      max={180}
                      value={customMinutes}
                      onChange={(e) => handleCustomChange(e.target.value)}
                    />
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Subject
                    </label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="">Select a subject</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.icon} {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSubjectId && topics.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Topic (optional)
                      </label>
                      <select
                        value={selectedTopicId}
                        onChange={(e) => setSelectedTopicId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        <option value="">No specific topic</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!selectedSubjectId}
                    onClick={handleStart}
                  >
                    Start {MODE_LABELS[timerMode]}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {!isRunning && (
                    <Button size="lg" onClick={handleStart}>
                      Start
                    </Button>
                  )}
                  {isRunning && !isPaused && (
                    <Button size="lg" variant="secondary" onClick={handlePause}>
                      Pause
                    </Button>
                  )}
                  {isPaused && (
                    <Button size="lg" onClick={handleResume}>
                      Resume
                    </Button>
                  )}
                  {(isRunning || isPaused) && (
                    <Button size="lg" variant="ghost" onClick={handleReset}>
                      Reset
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sessions</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Pomodoros completed</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{completedSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total focus time</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {Math.round((completedSessions * (totalSeconds / 60)))} min
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-2 rounded-full ${
                        i < pomodoroCount % 4 || (pomodoroCount > 0 && pomodoroCount % 4 === 0 && i < 4)
                          ? progressColor
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getLongBreakEvery() ? 'Long break next!' : `Next long break in ${4 - (pomodoroCount % 4)} pomodor${4 - (pomodoroCount % 4) === 1 ? 'o' : 'o'}s`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Switch</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(Object.keys(MODE_LABELS) as TimerMode[]).map((mode) => (
                  <Button
                    key={mode}
                    variant={timerMode === mode ? 'primary' : 'ghost'}
                    className="w-full justify-start"
                    size="sm"
                    disabled={isRunning}
                    onClick={() => handleModeChange(mode)}
                  >
                    {MODE_LABELS[mode]}
                    <span className="ml-auto text-xs opacity-70">
                      {mode === 'custom' ? `${customMinutes}m` : `${TIMER_DURATIONS[mode] / 60}m`}
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {isRunning && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Progress</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="w-full bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700 h-3">
                    <div
                      className={`h-full transition-all duration-300 ease-out rounded-full ${progressColor}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{formatTime(totalSeconds - remainingSeconds)} elapsed</span>
                    <span>{formatTime(remainingSeconds)} remaining</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
