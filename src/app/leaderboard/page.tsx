'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Badge, Progress } from '@/components/ui';
import { userProfileStorage, studySessionStorage, xpTransactionStorage } from '@/lib/storage';
import { UserProfile, StudySession, XpTransaction } from '@/types';

type LeaderboardFilter = 'all-time' | 'this-week' | 'this-month';

interface LeaderboardEntry {
  rank: number;
  profile: UserProfile;
  xp: number;
  studyTime: number;
  streak: number;
  isCurrentUser: boolean;
}

function formatStudyTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getRankDisplay(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function getRankBadgeVariant(rank: number): 'warning' | 'default' | 'info' {
  if (rank === 1) return 'warning';
  if (rank === 2) return 'default';
  if (rank === 3) return 'info';
  return 'default';
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [filter, setFilter] = useState<LeaderboardFilter>('all-time');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !user) return;

    const loadLeaderboard = async () => {
      setIsLoading(true);

      try {
        const allProfiles = await userProfileStorage.getAll();
        const allSessions = await studySessionStorage.getAll();
        const allTransactions = await xpTransactionStorage.getAll();

        const now = new Date();

        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);

        const monthStart = new Date(now);
        monthStart.setMonth(monthStart.getMonth() - 1);
        monthStart.setHours(0, 0, 0, 0);

        const computed: LeaderboardEntry[] = allProfiles.map((profile) => {
          let xp = profile.xp;
          let studyTime = profile.studyTimeAllTime;

          if (filter === 'this-week') {
            const userTransactions = allTransactions.filter(
              (t: XpTransaction) => t.userId === profile.id && new Date(t.createdAt) >= weekStart
            );
            xp = userTransactions.reduce((sum: number, t: XpTransaction) => sum + t.amount, 0);

            const userSessions = allSessions.filter(
              (s: StudySession) => new Date(s.startTime) >= weekStart
            );
            studyTime = userSessions.reduce((sum: number, s: StudySession) => sum + s.duration, 0);
          } else if (filter === 'this-month') {
            const userTransactions = allTransactions.filter(
              (t: XpTransaction) => t.userId === profile.id && new Date(t.createdAt) >= monthStart
            );
            xp = userTransactions.reduce((sum: number, t: XpTransaction) => sum + t.amount, 0);

            const userSessions = allSessions.filter(
              (s: StudySession) => new Date(s.startTime) >= monthStart
            );
            studyTime = userSessions.reduce((sum: number, s: StudySession) => sum + s.duration, 0);
          }

          return {
            rank: 0,
            profile,
            xp,
            studyTime,
            streak: profile.streak,
            isCurrentUser: profile.id === user.id,
          };
        });

        computed.sort((a, b) => b.xp - a.xp);

        const ranked = computed.map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

        setEntries(ranked);
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderboard();
  }, [filter, mounted, user]);

  const maxXP = entries.length > 0 ? Math.max(...entries.map((e) => e.xp), 1) : 1;

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Leaderboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            See how you rank among other learners
          </p>
        </div>

        <div className="flex gap-2">
          {(['all-time', 'this-week', 'this-month'] as LeaderboardFilter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all-time' ? 'All Time' : f === 'this-week' ? 'This Week' : 'This Month'}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500 dark:text-gray-400">
                Loading leaderboard...
              </div>
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-3">
                <div className="text-4xl">🏆</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  No data yet
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Start studying to appear on the leaderboard.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const isTop3 = entry.rank <= 3;
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
                            alt={entry.profile.displayName}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                              {entry.profile.displayName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white truncate">
                            {entry.profile.displayName}
                          </span>
                          {entry.isCurrentUser && (
                            <Badge variant="info">You</Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Level {entry.profile.level}
                        </div>
                      </div>

                      <div className="hidden sm:block flex-1 px-4">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {entry.xp.toLocaleString()} XP
                        </div>
                        <Progress
                          value={entry.xp}
                          max={maxXP}
                          size="sm"
                        />
                      </div>

                      <div className="flex-shrink-0 text-right space-y-1">
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {entry.xp.toLocaleString()} XP
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>⏱ {formatStudyTime(entry.studyTime)}</span>
                          <span>🔥 {entry.streak}d</span>
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
