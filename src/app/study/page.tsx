'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Progress, Badge } from '@/components/ui';
import { subjectStorage, userProfileStorage, studySessionStorage, xpTransactionStorage } from '@/lib/storage';
import { studySessionStorage, xpTransactionStorage } from '@/lib/storage';
import { UserProfile } from '@/types';

export default function StudyDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [subjects, setSubjects] = useState<string[]>([]);
  const [studyTimeToday, setStudyTimeToday] = useState(0);
  const [studyTimeThisWeek, setStudyTimeThisWeek] = useState(0);
  const [studyTimeAllTime, setStudyTimeAllTime] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [userXp, setUserXp] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);

  useEffect(() => {
    subjectStorage.getAll().then((subjects) => setSubjects(subjects.map((s: any) => s.name)));
    
    userProfileStorage.get(user.id).then((profile: UserProfile) => {
      if (profile) {
        setStudyTimeToday(profile.studyTimeToday || 0);
        setStudyTimeThisWeek(profile.studyTimeThisWeek || 0);
        setStudyTimeAllTime(profile.studyTimeAllTime || 0);
        setCurrentStreak(profile.streak || 0);
        setUserXp(profile.xp || 0);
        setUserLevel(profile.level || 1);
      }
    });
  }, [user]);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          StudyForge
        </h1>
        <h2 className="text-xl text-gray-600 dark:text-gray-400 mb-6">
          Your Study Dashboard
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Study Time Card */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Study Time</h3>
            </CardHeader>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatTime(studyTimeToday)} today</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Today</p>
                </div>
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-4 w-24">
                  <div
                    className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                    style={{ width: ((studyTimeToday / 180) * 100) || 0 }} /* 30 min default goal */
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Streak Card */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Streak</h3>
            </CardHeader>
            <CardContent className="py-4">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{currentStreak}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">days</p>
            </CardContent>
          </Card>

          {/* XP Card */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">XP & Level</h3>
            </CardHeader>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{userXp}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">XP</span>
              </div>
              <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-32">
                <div
                  className="h-full rounded-full bg-green-500 dark:bg-green-400 transition-all duration-300"
                  style={{ width: ((userXp / (userLevel * 100)) * 100) || 0 }}
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Lvl {userLevel}</p>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Start Study Timer</h3>
            </CardHeader>
            <CardContent>
              <Button size="lg" onClick={() => router.push('/study/timer')}>
                Start Timer
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Start Stopwatch</h3>
            </CardHeader>
            <CardContent>
              <Button size="lg" onClick={() => router.push('/study/stopwatch')}>
                Start Stopwatch
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Flashcards</h3>
            </CardHeader>
            <CardContent>
              <Button size="lg" onClick={() => router.push('/study/flashcards')}>
                View Flashcards
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Additional features */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Quizzes</h3>
            </CardHeader>
            <CardContent>
              <Button size="sm" onClick={() => router.push('/study/quiz')}>
                Take Quiz
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</h3>
            </CardHeader>
            <CardContent>
              <Button size="sm" onClick={() => router.push('/study/notes')}>
                View Notes
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Sessions */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Recent Sessions</h3>
          </CardHeader>
          <CardContent>
            {recentSessions.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {recentSessions.slice(0, 5).map((session: any) => (
                  <li key={session.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {session.subject || 'Study'} - {session.duration || 0}m
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No sessions yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}