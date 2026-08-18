'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Badge } from '@/components/ui';
import { subjectStorage } from '@/lib/storage';

export default function StudyStopwatch() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [lapTime, setLapTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const lapTimesRef = useRef<number[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    subjectStorage.getAll().then((subjects) => setSubjects(subjects.map((s: any) => s.name)));
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const startStopwatch = () => {
    setIsRunning(true);
    startTimeRef.current = Date.now() - totalTime;
    timerRef.current = setInterval(() => {
      const now = Date.now();
      setTotalTime((now - startTimeRef.current!) / 1000);
    }, 10);
  };

  const pauseStopwatch = () => {
    setIsRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const resumeStopwatch = () => {
    setIsRunning(true);
    startTimeRef.current = Date.now() - totalTime;
    timerRef.current = setInterval(() => {
      const now = Date.now();
      setTotalTime((now - startTimeRef.current!) / 1000);
    }, 10);
  };

  const resetStopwatch = () => {
    setIsRunning(false);
    setTotalTime(0);
    setLapTime(0);
    lapTimesRef.current = [];
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const recordLap = () => {
    lapTimesRef.current?.push(totalTime);
    setLapTime(totalTime);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Study Stopwatch
        </h1>

        {/* Stopwatch Display */}
        <div className="relative">
          <span className="text-6xl font-mono font-bold text-gray-900 dark:text-white">
            {formatTime(totalTime)}
          </span>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Button
            onClick={isRunning ? pauseStopwatch : startStopwatch}
            variant={isRunning ? 'secondary' : 'primary'}
            size="lg"
          >
            {isRunning ? 'Pause' : 'Start'}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={resetStopwatch}
          >
            Reset
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={recordLap}
            disabled={!isRunning}
          >
            Lap
          </Button>
        </div>

        {/* Subject and Lap info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Best Lap
            </label>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {lapTime > 0 ? formatTime(lapTime) : '—'}
            </p>
          </div>
        </div>

        {/* Laps List */}
        {lapTimesRef.current.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Laps</h3>
            <div className="space-y-1">
              {lapTimesRef.current.slice(0, 5).map((lap, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span>{index + 1}</span>
                  <span>{formatTime(lap)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Total time recorded: {formatTime(totalTime)}
          </p>
          <Button
            size="lg"
            onClick={resetStopwatch}
            className="w-full"
          >
            Reset Stopwatch
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}