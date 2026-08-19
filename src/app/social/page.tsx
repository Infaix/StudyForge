'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, EmptyState, Badge } from '@/components/ui';
import { userProfileStorage, studySessionStorage, xpTransactionStorage } from '@/lib/storage';
import { StudyActivity, StudySession, XpTransaction, UserProfile } from '@/types';
import {
  getFriendActivity,
  computeLeaderboard,
  formatTimeAgo,
  formatStudyTime,
  type LeaderboardEntry,
} from '@/lib/social/socialService';

const ACTIVITY_ICONS: Record<string, string> = {
  study_session: '📖',
  stopwatch_session: '⏱️',
  quiz: '🧠',
  flashcard: '🎴',
  achievement: '🏆',
  level_up: '⭐',
  streak_milestone: '🔥',
};

function renderAvatar(profile: UserProfile | null, size: string = 'w-8 h-8') {
  if (!profile) return null;
  if (profile.avatarUrl) {
    return <img src={profile.avatarUrl} alt={profile.displayName || profile.username} className={`${size} rounded-full object-cover`} />;
  }
  const name = profile.displayName || profile.username || 'U';
  const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className={`${size} rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0`}>
      {initials}
    </div>
  );
}

export default function SocialPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [activities, setActivities] = useState<(StudyActivity & { userProfile?: UserProfile | null })[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !user) router.push('/login');
  }, [mounted, user, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [friendActivities, leaderboard] = await Promise.all([
        getFriendActivity(user.id, 50),
        computeLeaderboard('all-time', 'xp', user.id),
      ]);

      setActivities(friendActivities);

      const me = leaderboard.find((e) => e.isCurrentUser);
      setMyRank(me ?? null);
    } catch (err) {
      console.error('Failed to load social data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (mounted && user) loadData();
  }, [loadData, mounted, user]);

  if (!mounted || !user) return null;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Social</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            See what your friends are up to
          </p>
        </div>

        {myRank && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Position</h2>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 text-center">
                  <span className="text-2xl">{myRank.rank <= 3 ? ['🥇', '🥈', '🥉'][myRank.rank - 1] : `#${myRank.rank}`}</span>
                </div>
                {renderAvatar(user, 'w-10 h-10')}
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {user.displayName || user.username}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Level {user.level}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{user.xp.toLocaleString()} XP</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatStudyTime(user.studyTimeAllTime)} studied
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Friend Activity</h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/friends')}>
                Find Friends
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex items-start gap-3 p-3 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-1" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <EmptyState
                icon={<span className="text-4xl">📢</span>}
                title="No activity yet"
                description="Add some friends to see what they're working on, or start studying to generate your own activity."
                action={{
                  label: 'Find Friends',
                  onClick: () => router.push('/friends'),
                }}
              />
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    {activity.userProfile ? (
                      <div
                        className="cursor-pointer flex-shrink-0"
                        onClick={() => router.push(`/profile/${activity.userProfile!.username}`)}
                      >
                        {renderAvatar(activity.userProfile)}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs flex-shrink-0">?</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ACTIVITY_ICONS[activity.type] || '📝'}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white">
                            <span
                              className="font-semibold cursor-pointer hover:underline"
                              onClick={() => activity.userProfile && router.push(`/profile/${activity.userProfile.username}`)}
                            >
                              {activity.userProfile?.displayName || activity.userProfile?.username || 'Unknown'}
                            </span>
                            {' '}
                            {activity.title}
                          </p>
                          {activity.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {activity.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500">
                        <span>{formatTimeAgo(activity.createdAt)}</span>
                        {activity.durationMinutes && activity.durationMinutes > 0 && (
                          <span>{formatStudyTime(activity.durationMinutes)}</span>
                        )}
                        {activity.xpAwarded > 0 && (
                          <span>+{activity.xpAwarded} XP</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
