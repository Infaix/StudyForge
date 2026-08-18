'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Progress, Badge } from '@/components/ui';
import { userProfileStorage, studySessionStorage } from '@/lib/storage';
import { UserProfile, StudySession } from '@/types';

interface QuickStartItem {
  label: string;
  route: string;
  icon: React.ReactNode;
  color: string;
}

const quickStartItems: QuickStartItem[] = [
  {
    label: 'Timer',
    route: '/study/timer',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M5 3L2 6" />
        <path d="M22 6l-3-3" />
        <path d="M12 5V3" />
      </svg>
    ),
    color: 'bg-blue-500',
  },
  {
    label: 'Stopwatch',
    route: '/study/stopwatch',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4" />
        <path d="M10 2h4" />
        <path d="M20 5l-1.5 1.5" />
      </svg>
    ),
    color: 'bg-green-500',
  },
  {
    label: 'Flashcards',
    route: '/flashcards',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M10 14h4" />
      </svg>
    ),
    color: 'bg-purple-500',
  },
  {
    label: 'Notes',
    route: '/notes',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
      </svg>
    ),
    color: 'bg-yellow-500',
  },
  {
    label: 'Quizzes',
    route: '/quizzes',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
        <path d="M9 21h6" />
        <path d="M12 18v3" />
      </svg>
    ),
    color: 'bg-red-500',
  },
  {
    label: 'Planner',
    route: '/planner',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
      </svg>
    ),
    color: 'bg-indigo-500',
  },
  {
    label: 'Exam Countdown',
    route: '/assessments',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
        <circle cx="8" cy="6" r="1" fill="currentColor" />
        <circle cx="8" cy="12" r="1" fill="currentColor" />
        <circle cx="8" cy="18" r="1" fill="currentColor" />
      </svg>
    ),
    color: 'bg-orange-500',
  },
  {
    label: 'Question Generator',
    route: '/quizzes',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <circle cx="12" cy="17" r="0.5" fill="currentColor" />
      </svg>
    ),
    color: 'bg-pink-500',
  },
  {
    label: 'Maths Formulas',
    route: '/formulas',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M6 4h6l-6 16h6" />
        <path d="M14 4l4 8-4 8" />
        <path d="M18 12H8" />
      </svg>
    ),
    color: 'bg-teal-500',
  },
  {
    label: 'Physics Formulas',
    route: '/formulas',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="2" />
        <ellipse cx="12" cy="12" rx="10" ry="4" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
      </svg>
    ),
    color: 'bg-cyan-500',
  },
  {
    label: 'ATAR Calculator',
    route: '/calculators',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h3v6H8z" />
        <path d="M14 9h2v6h-2z" />
        <path d="M8 15h8" />
      </svg>
    ),
    color: 'bg-violet-500',
  },
  {
    label: 'Study Score Calc',
    route: '/calculators',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    color: 'bg-emerald-500',
  },
  {
    label: 'GPA Calculator',
    route: '/calculators',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        <path d="M9 7h6" />
        <path d="M9 11h4" />
      </svg>
    ),
    color: 'bg-amber-500',
  },
  {
    label: 'Unit Converter',
    route: '/calculators',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M17 4v16" />
        <path d="M7 4v16" />
        <path d="M3 8l4-4 4 4" />
        <path d="M13 20l4-4-4-4" />
      </svg>
    ),
    color: 'bg-sky-500',
  },
  {
    label: 'Focus Dashboard',
    route: '/focus',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    color: 'bg-rose-500',
  },
  {
    label: 'Leaderboard',
    route: '/leaderboard',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 1012 0V2z" />
      </svg>
    ),
    color: 'bg-yellow-600',
  },
];

function formatTime(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function StudyHub() {
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    let mounted = true;

    const loadData = async () => {
      try {
        const [loadedProfile, allSessions] = await Promise.all([
          userProfileStorage.get('current-user'),
          studySessionStorage.getAll(),
        ]);

        if (!mounted) return;

        setProfile(loadedProfile);

        const sorted = allSessions
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
          .slice(0, 5);
        setRecentSessions(sorted);
      } catch (err) {
        console.error('Failed to load study hub data:', err);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user, router]);

  if (!user) return null;

  const studyTimeToday = profile?.studyTimeToday ?? 0;
  const studyTimeWeek = profile?.studyTimeThisWeek ?? 0;
  const streak = profile?.streak ?? 0;
  const xp = profile?.xp ?? 0;
  const level = profile?.level ?? 1;
  const xpForNext = level * 100;
  const xpProgress = Math.min((xp / xpForNext) * 100, 100);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            StudyHub
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Welcome back{profile?.displayName ? `, ${profile.displayName}` : ''}! Keep up the momentum.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Today</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{formatTime(studyTimeToday)}</p>
              <Progress value={studyTimeToday} max={180} size="sm" className="mt-2" />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">This Week</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{formatTime(studyTimeWeek)}</p>
              <Progress value={studyTimeWeek} max={1200} size="sm" className="mt-2" />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Streak</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{streak}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {streak === 1 ? 'day' : 'days'} in a row
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">XP</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{xp.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{xpForNext - xp} to next level</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Level</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{level}</p>
              <Progress value={xpProgress} max={100} size="sm" className="mt-2" />
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Quick Start
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {quickStartItems.map((item) => (
              <Card
                key={item.label}
                className="cursor-pointer hover:shadow-md transition-shadow duration-200 dark:hover:shadow-lg dark:hover:shadow-gray-800/50"
                onClick={() => router.push(item.route)}
              >
                <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
                  <div className={`flex items-center justify-center w-14 h-14 rounded-xl text-white ${item.color}`}>
                    {item.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 text-center">
                    {item.label}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Recent Sessions
            </h2>
            {recentSessions.length > 0 && (
              <Badge variant="info">{recentSessions.length} recent</Badge>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              {recentSessions.length > 0 ? (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recentSessions.map((session) => (
                    <li
                      key={session.id}
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {session.subjectId ? `Subject session` : 'Study session'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatSessionDate(session.startTime)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Badge variant="default">{session.duration}m</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No study sessions yet. Start a timer to begin tracking!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
