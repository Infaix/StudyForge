'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, Button, Badge, Progress } from '@/components/ui';
import { userProfileStorage } from '@/lib/storage';
import {
  computeLeaderboard,
  getFriends,
  formatStudyTime,
  type LeaderboardEntry,
  type LeaderboardCategory,
  type LeaderboardPeriod,
} from '@/lib/social/socialService';

function getRankDisplay(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState<LeaderboardPeriod>('all-time');
  const [category, setCategory] = useState<LeaderboardCategory>('xp');
  const [showFriendsOnly, setShowFriendsOnly] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [friendIds, setFriendIds] = useState<string[]>([]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !user) router.push('/login');
  }, [mounted, user, router]);

  useEffect(() => {
    if (!user) return;
    getFriends(user.id).then((friends) => {
      setFriendIds(friends.map((f) => f.id));
    });
  }, [user]);

  const loadLeaderboard = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await computeLeaderboard(
        period,
        category,
        user.id,
        showFriendsOnly && friendIds.length > 0 ? friendIds : undefined
      );
      setEntries(result);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period, category, showFriendsOnly, friendIds, user]);

  useEffect(() => {
    if (mounted && user) loadLeaderboard();
  }, [loadLeaderboard, mounted, user]);

  const maxXP = entries.length > 0 ? Math.max(...entries.map((e) => {
    if (category === 'xp') return e.xp;
    if (category === 'studyTime') return e.studyTime;
    return e.streak;
  }), 1) : 1;

  if (!mounted) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leaderboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            See how you rank among other learners
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['all-time', 'this-week', 'this-month'] as LeaderboardPeriod[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(p)}
              >
                {p === 'all-time' ? 'All Time' : p === 'this-week' ? 'This Week' : 'This Month'}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(['xp', 'studyTime', 'streak'] as LeaderboardCategory[]).map((c) => (
              <Button
                key={c}
                variant={category === c ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setCategory(c)}
              >
                {c === 'xp' ? 'XP' : c === 'studyTime' ? 'Study Time' : 'Streak'}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFriendsOnly(!showFriendsOnly)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showFriendsOnly
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              👥 Friends Only
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="w-12 h-8 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-1" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                </div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-3">
                <div className="text-4xl">🏆</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {showFriendsOnly ? 'No friends to rank' : 'No data yet'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {showFriendsOnly
                    ? 'Add some friends to see how you compare.'
                    : 'Start studying to appear on the leaderboard.'}
                </p>
                {showFriendsOnly && (
                  <Button variant="primary" size="sm" onClick={() => router.push('/friends')}>
                    Find Friends
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const isTop3 = entry.rank <= 3;
              const value = category === 'xp' ? entry.xp : category === 'studyTime' ? entry.studyTime : entry.streak;

              const rankBg =
                entry.rank === 1
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : entry.rank === 2
                  ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                  : entry.rank === 3
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                  : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700';

              return (
                <Card
                  key={entry.profile.id}
                  className={`transition-all ${
                    entry.isCurrentUser
                      ? 'ring-2 ring-blue-500 dark:ring-blue-400'
                      : ''
                  } ${rankBg}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-12 text-center">
                        <span className={`text-2xl ${isTop3 ? '' : 'text-lg font-bold text-gray-500 dark:text-gray-400'}`}>
                          {getRankDisplay(entry.rank)}
                        </span>
                      </div>

                      <div className="flex-shrink-0">
                        {entry.profile.avatarUrl ? (
                          <img
                            src={entry.profile.avatarUrl}
                            alt={entry.profile.displayName || entry.profile.username}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                              {(entry.profile.displayName || entry.profile.username || 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-semibold text-gray-900 dark:text-white truncate cursor-pointer hover:underline"
                            onClick={() => router.push(`/profile/${entry.profile.username}`)}
                          >
                            {entry.profile.displayName || entry.profile.username}
                          </span>
                          {entry.isCurrentUser && <Badge variant="info">You</Badge>}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          @{entry.profile.username} · Level {entry.profile.level}
                        </div>
                      </div>

                      <div className="hidden sm:block flex-1 px-4">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {category === 'xp' && `${value.toLocaleString()} XP`}
                          {category === 'studyTime' && formatStudyTime(value)}
                          {category === 'streak' && `${value} days`}
                        </div>
                        <Progress
                          value={value}
                          max={maxXP}
                          size="sm"
                        />
                      </div>

                      <div className="flex-shrink-0 text-right space-y-1">
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {category === 'xp' && `${value.toLocaleString()} XP`}
                          {category === 'studyTime' && formatStudyTime(value)}
                          {category === 'streak' && `${value}d`}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          {category !== 'xp' && <span>⚡ {entry.xp.toLocaleString()} XP</span>}
                          {category !== 'studyTime' && <span>⏱ {formatStudyTime(entry.studyTime)}</span>}
                          {category !== 'streak' && <span>🔥 {entry.streak}d</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
