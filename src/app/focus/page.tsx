'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button, Card, CardContent, CardHeader, Input, EmptyState, PageHeader, Badge } from '@/components/ui';
import { subjectStorage } from '@/lib/storage';
import { Subject } from '@/types';

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
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(30);
  const [totalSeconds, setTotalSeconds] = useState(TIMER_DURATIONS.pomodoro);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMER_DURATIONS.pomodoro);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [showSetup, setShowSetup] = useState(true);
  const [completedSessions, setCompletedSessions] = useState(0);

  useEffect(() => {
    subjectStorage.getAll().then(setSubjects);
  }, []);

  const handleTimerComplete = useCallback(() => {
    setCompletedSessions((p) => p + 1);
    setPomodoroCount((p) => p + 1);
  }, []);

  const tick = useCallback(() => {
    // Simple countdown
  }, []);

  useEffect(() => {
    return () => {
      // cleanup
    };
  }, []);

  const startTimer = (seconds: number) => {
    // Start timer
  };

  const handleStart = () => {
    // Start timer
  };

  const handlePause = () => {
    // Pause timer
  };

  const handleResume = () => {
    // Resume timer
  };

  const handleReset = () => {
    // Reset timer
  };

  const handleModeChange = (mode: TimerMode) => {
    setTimerMode(mode);
  };

  const handleCustomChange = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0 && n <= 180) {
      setCustomMinutes(n);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s}`;
  };

  if (subjects.length === 0) {
    return (
      <DashboardLayout>
        <PageHeader title="Focus" description="Study timer" />
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
      <PageHeader title="Focus" description="Study timer" />
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold">Focus Timer</h2>
        <p className="text-gray-600">Timer functionality coming soon</p>
        <Button onClick={handleStart} className="mt-4">
          Start Timer
        </Button>
      </div>
    </DashboardLayout>
  );
}