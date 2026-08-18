'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  EmptyState,
  Progress,
} from '@/components/ui';
import { userProfileStorage, studyActivityStorage, xpTransactionStorage } from '@/lib/storage';

type LeaderboardFilter = 'today' | 'this-week' | 'this-month' | 'all-time';

interface LeaderboardEntry {
  rank: number;
  username: string;
  avatarUrl: string | null;
  xp: number;
  studyTime: number;
  streak: number;
  isCurrentUser: boolean;
}

interface LeaderboardFilters {
  [key: string]: LeaderboardFilter;
}

export default function LeaderboardPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [filter, setFilter] = useState<LeaderboardFilter>('all-time');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, [filter]);

  const loadLeaderboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get all study activities
      const allActivities = await studyActivityStorage.getAllByUser(user.id);
      
      // Get all XP transactions
      const allXpTransactions = await xpTransactionStorage.getAllByUser(user.id);

      // Calculate entries based on filter
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      
      const monthStart = new Date(now);
      monthStart.setMonth(monthStart.getMonth() - 1);
      monthStart.setHours(0, 0, 0, 0);

      // Aggregate by user (in a real app, this would aggregate from all users)
      // For now, we'll just show the current user's data
      const userActivities = allActivities.filter((a: any) => a.userId === user.id);
      
      let studyTime = 0;
      let xp = 0;
      let streak = 0;

      // Calculate study time based on filter
      const activities = userActivities.filter((a: any) => {
        const activityDate = new Date(a.startTime);
        switch (filter) {
          case 'today':
            return activityDate >= todayStart;
          case 'this-week':
            return activityDate >= weekStart && activityDate < todayStart;
          case 'this-month':
            return activityDate >= monthStart && activityDate < todayStart;
          default:
            return true;
        }
      });

      studyTime = activities.reduce((sum: number, a: any) => sum + (a.duration ?? 0), 0);
      xp = allXpTransactions.reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);
      
      // Simple streak calculation (last 7 days)
      const recentDates = new Set();
      activities.slice(0, 7).forEach((a: any) => {
        const d = new Date(a.startTime);
        recentDates.add(d.toISOString().split('T')[0]);
      });
      streak = recentDates.size;

      setEntries([{
        rank: 1,
        username: user.displayName || user.username,
        avatarUrl: user.avatarUrl,
        xp,
        studyTime,
        streak,
        isCurrentUser: true,
      }]);

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      setError('Failed to load leaderboard');
      setIsLoading(false);
    }
  };

  const handleFilterChange = (newFilter: LeaderboardFilter) => {
    setFilter(newFilter);
    loadLeaderboard();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="bg-white rounded-xl p-8 max-w-md w-full dark:bg-gray-800 shadow-lg">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Leaderboard</h2>
            </CardHeader>
            <CardContent>Loading leaderboard...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="bg-white rounded-xl p-8 max-w-md w-full dark:bg-gray-800 shadow-lg">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Leaderboard</h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Leaderboard
          <div className="flex gap-2 ms-auto">
            <Button
              variant={filter === 'all-time' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all-time')}
            >
              All Time
            </Button>
            <Button
              variant={filter === 'today' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('today')}
            >
              Today
            </Button>
            <Button
              variant={filter === 'this-week' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('this-week')}
            >
              This Week
            </Button>
            <Button
              variant={filter === 'this-month' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setFilter('this-month')}
            >
              This Month
            </Button>
          </div>
        </h2>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState
            icon={<span className="text-3xl">🏆</span>}
            title="No leaderboard data"
            description="Start studying to appear on the leaderboard."
          />
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div
                key={entry.username}
                className={`flex flex-col lg:flex-row items-center justify-between px-4 py-3 rounded-lg ${
                  entry.isCurrentUser ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-4 mb-2 lg:mb-0 lg:pr-4">
                  {entry.avatarUrl ? (
                    <img
                      src={entry.avatarUrl}
                      alt={entry.username}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        {entry.username[0]}
                      </span>
                    </div>
                  )}
                  <span
                    className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-900 dark:text-white"
                  >
                    {entry.username}
                  </span>
                </div>
                <div className="text-right flex-1">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {entry.xp} XP
                  </span>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatStudyTime(entry.studyTime)} study
                  </p>
                  <span className="text-xs text-green-600 dark:text-green-400">
                    {entry.streak} streak
                  </span>
                </div>
                {entry.isCurrentUser && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 mt-1 lg:mt-0">You</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatStudyTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}