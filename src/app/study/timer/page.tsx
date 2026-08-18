'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Progress, Badge, Input } from '@/components/ui';
import { subjectStorage } from '@/lib/storage';
import { studySessionStorage, xpTransactionStorage, userProfileStorage } from '@/lib/storage';
import { UserProfile } from '@/types';

export default function StudyTimer() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [timerMode, setTimerMode] = useState<'pomodoro' | 'countdown' | 'stopwatch'>('pomodoro');
  const [duration, setDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [sessionsBeforeLongBreak, setSessionsBeforeLongBreak] = useState(4);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(25 * 60);
  const [totalTime, setTotalTime] = useState(25 * 60);
  const [isPaused, setIsPaused] = useState(false);
  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRemainingRef = useRef<number>(0);

  useEffect(() => {
    subjectStorage.getAll().then((subjects) => setSubjects(subjects.map((s: any) => s.name)));
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const startTimer = () => {
    setIsRunning(true);
    setIsPaused(false);
    endTimeRef.current = Date.now() + remainingTime * 1000;
    intervalRef.current = setInterval(() => {
      if (!endTimeRef.current) return;
      const now = Date.now();
      const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
      setRemainingTime(left);
      if (left <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
        setIsPaused(false);
        // Session complete - award XP
        setSessionsCompleted((p) => p + 1);
        setRemainingTime(totalTime);
        // In real implementation, would create study session and award XP
      }
    }, 1000);
  };

  const pauseTimer = () => {
    setIsPaused(true);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    pausedRemainingRef.current = remainingTime;
  };

  const resumeTimer = () => {
    setIsPaused(false);
    setIsRunning(true);
    endTimeRef.current = Date.now() + pausedRemainingRef.current * 1000;
    intervalRef.current = setInterval(() => {
      if (!endTimeRef.current) return;
      const now = Date.now();
      const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
      setRemainingTime(left);
      if (left <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
        setIsPaused(false);
        setSessionsCompleted((p) => p + 1);
        setRemainingTime(totalTime);
      }
    }, 1000);
  };

  const resetTimer = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
    setRemainingTime(totalTime);
  };

  const handleStart = () => {
    if (!selectedSubject) return;
    setTotalTime(duration * 60);
    setRemainingTime(duration * 60);
    startTimer();
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Study Timer
        </h1>

        {/* Timer Display */}
        <div className="relative">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 256 256">
            <circle
              cx="128"
              cy="128"
              r="112"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle
              cx="128"
              cy="128"
              r="112"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 112}
              strokeDashoffset={2 * Math.PI * 112 * (1 - remainingTime / totalTime)}
              className="timer-ring bg-gray-200 dark:bg-gray-700"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-mono font-bold text-gray-900 dark:text-white">
                {formatTime(remainingTime)}
              </span>
            </div>
          </svg>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {(['pomodoro', 'countdown', 'stopwatch'] as const).map((mode) => (
            <Button
              key={mode}
              variant={timerMode === mode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setTimerMode(mode)}
            >
              {mode === 'pomodoro' ? 'Pomodoro' : mode === 'countdown' ? 'Countdown' : 'Stopwatch'}
            </Button>
          )}
        </div>

        {/* Subject Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Subject
          </label>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Select a subject</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Study Duration (min)
            </label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 25)}
              min={1}
              max={180}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Break Duration (min)
            </label>
            <Input
              type="number"
              value={breakDuration}
              onChange={(e) => setBreakDuration(parseInt(e.target.value) || 5)}
              min={1}
              max={60}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sessions Before Long Break
            </label>
            <Input
              type="number"
              value={sessionsBeforeLongBreak}
              onChange={(e) => setSessionsBeforeLongBreak(parseInt(e.target.value) || 4)}
              min={1}
              max={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-8">
          {!isRunning && !isPaused && (
            <Button size="lg" onClick={handleStart}>
              Start {timerMode === 'pomodoro' ? 'Session' : ''}
            </Button>
          )}
          {isRunning && !isPaused && (
            <Button size="lg" variant="secondary" onClick={pauseTimer}>
              Pause
            </Button>
          )}
          {isPaused && (
            <Button size="lg" onClick={resumeTimer}>
              Resume
            </Button>
          )}
          <Button size="lg" variant="ghost" onClick={resetTimer}>
            Reset
          </Button>
        </div>

        {/* Fullscreen Button */}
        <div className="text-right">
          <Button size="sm" onClick={() => window.alert('Fullscreen not implemented yet')}>
            Fullscreen
          </Button>
        </div>

        {/* Session Stats */}
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sessions completed: {sessionsCompleted}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Current mode: {timerMode}
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}