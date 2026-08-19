'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Progress,
  EmptyState,
} from '@/components/ui';
import { userProfileStorage } from '@/lib/storage';
import { UserProfile } from '@/types';
import {
  getFriendshipStatus,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  canViewProfile,
  canViewStats,
  canViewActivity,
  formatStudyTime,
  formatTimeAgo,
  type FriendshipStatus,
} from '@/lib/social/socialService';

function generateAvatar(profile: UserProfile) {
  if (profile.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={profile.displayName || profile.username}
        className="w-24 h-24 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
      />
    );
  }
  const name = profile.displayName || profile.username || 'U';
  const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center border-4 border-gray-200 dark:border-gray-700">
      <span className="text-3xl font-bold text-blue-600 dark:text-blue-300">{initials}</span>
    </div>
  );
}

const ACHIEVEMENTS_MAP: Record<string, { title: string; icon: string; description: string }> = {
  first_session: { title: 'First Steps', icon: '🎓', description: 'Complete your first study session' },
  streak_3: { title: 'On Fire', icon: '🔥', description: 'Maintain a 3-day study streak' },
  streak_7: { title: 'Weekly Warrior', icon: '⚔️', description: 'Maintain a 7-day study streak' },
  streak_30: { title: 'Monthly Master', icon: '👑', description: 'Maintain a 30-day study streak' },
  sessions_10: { title: 'Dedicated Learner', icon: '📚', description: 'Complete 10 study sessions' },
  sessions_50: { title: 'Study Addict', icon: '🧪', description: 'Complete 50 study sessions' },
  sessions_100: { title: 'Century Club', icon: '💯', description: 'Complete 100 study sessions' },
  xp_1000: { title: 'XP Collector', icon: '⚡', description: 'Earn 1,000 XP' },
  xp_5000: { title: 'XP Hunter', icon: '🎯', description: 'Earn 5,000 XP' },
  xp_10000: { title: 'XP Legend', icon: '🌟', description: 'Earn 10,000 XP' },
  level_5: { title: 'Rising Star', icon: '⭐', description: 'Reach level 5' },
  level_10: { title: 'Scholar', icon: '🏅', description: 'Reach level 10' },
  level_25: { title: 'Grandmaster', icon: '🏆', description: 'Reach level 25' },
  subjects_3: { title: 'Multidisciplinary', icon: '🎨', description: 'Study 3 different subjects' },
  subjects_5: { title: 'Polymath', icon: '🧠', description: 'Study 5 different subjects' },
  time_60: { title: 'Hour of Power', icon: '⏱️', description: 'Study for 60 minutes total' },
  time_600: { title: 'Ten Hour Titan', icon: '🕐', description: 'Study for 600 minutes total' },
};

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await userProfileStorage.getByUsername(username);
      if (!profile) {
        setIsLoading(false);
        return;
      }
      const migrated = {
        ...profile,
        bio: profile.bio ?? '',
        privacy: profile.privacy ?? { profilePublic: true, showStats: true, showActivity: true, showLeaderboardStats: true, showSubjects: true },
      };
      setTargetUser(migrated);

      if (user) {
        const status = await getFriendshipStatus(user.id, profile.id);
        setFriendshipStatus(status);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setIsLoading(false);
    }
  }, [username, user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSendRequest = async () => {
    if (!user || !targetUser) return;
    setActionLoading(true);
    try {
      await sendFriendRequest(user.id, targetUser.id);
      setFriendshipStatus('pending_outgoing');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!user || !targetUser) return;
    setActionLoading(true);
    try {
      const requests = await (await import('@/lib/storage')).friendRequestStorage.getAllByUser(user.id);
      const pending = requests.find((r) => r.fromUserId === targetUser.id && r.status === 'pending');
      if (pending) {
        await acceptFriendRequest(user.id, pending);
        setFriendshipStatus('friends');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclineRequest = async () => {
    if (!user || !targetUser) return;
    setActionLoading(true);
    try {
      const requests = await (await import('@/lib/storage')).friendRequestStorage.getAllByUser(user.id);
      const pending = requests.find((r) => r.fromUserId === targetUser.id && r.status === 'pending');
      if (pending) {
        await declineFriendRequest(user.id, pending);
        setFriendshipStatus('none');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!user || !targetUser) return;
    if (!window.confirm('Remove this friend?')) return;
    setActionLoading(true);
    try {
      await removeFriend(user.id, targetUser.id);
      setFriendshipStatus('none');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading profile...</p>
      </div>
    );
  }

  if (!targetUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md w-full">
          <CardContent className="py-12">
            <EmptyState
              icon={<span className="text-6xl">👤</span>}
              title="User not found"
              description="The profile you are looking for does not exist."
              action={{
                label: 'Go Home',
                onClick: () => router.push('/'),
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user?.username === username) {
    router.push('/profile');
    return null;
  }

  const isOwner = user?.id === targetUser.id;
  const showStats = canViewStats(user?.id ?? null, targetUser);
  const showActivity = canViewActivity(user?.id ?? null, targetUser);
  const isPrivate = !canViewProfile(user?.id ?? null, targetUser);

  if (isPrivate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md w-full">
          <CardContent className="py-12">
            <EmptyState
              icon={<span className="text-6xl">🔒</span>}
              title="Private Profile"
              description="This user has made their profile private."
              action={{
                label: 'Go Back',
                onClick: () => router.back(),
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const xpForNextLevel = (targetUser.level || 1) * 100;
  const xpProgress = targetUser.xp % xpForNextLevel;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {generateAvatar(targetUser)}

              <div className="flex-1 w-full text-center sm:text-left">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {targetUser.displayName || targetUser.username}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  @{targetUser.username}
                </p>
                {targetUser.bio && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {targetUser.bio}
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Joined {new Date(targetUser.createdAt).toLocaleDateString()}
                </p>

                {user && !isOwner && (
                  <div className="mt-4">
                    {friendshipStatus === 'friends' ? (
                      <Button variant="secondary" size="sm" onClick={handleRemoveFriend} disabled={actionLoading}>
                        {actionLoading ? 'Removing...' : 'Friends ✓'}
                      </Button>
                    ) : friendshipStatus === 'pending_outgoing' ? (
                      <Badge variant="warning">Request Sent</Badge>
                    ) : friendshipStatus === 'pending_incoming' ? (
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={handleAcceptRequest} disabled={actionLoading}>
                          Accept Request
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleDeclineRequest} disabled={actionLoading}>
                          Decline
                        </Button>
                      </div>
                    ) : (
                      <Button variant="primary" size="sm" onClick={handleSendRequest} disabled={actionLoading}>
                        {actionLoading ? 'Sending...' : 'Add Friend'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {showStats && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Statistics</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{targetUser.streak}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Day{targetUser.streak !== 1 ? 's' : ''} Streak</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatStudyTime(targetUser.studyTimeAllTime)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Study</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{targetUser.level}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Level</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="info" className="text-sm">Level {targetUser.level}</Badge>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {xpProgress} / {xpForNextLevel} XP
                  </span>
                </div>
                <Progress value={xpProgress} max={xpForNextLevel} size="sm" />
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-2">
                  {targetUser.xp.toLocaleString()} XP
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {targetUser.achievements && targetUser.achievements.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Achievements</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {targetUser.achievements.map((achId) => {
                  const ach = ACHIEVEMENTS_MAP[achId];
                  return (
                    <div key={achId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="text-2xl flex-shrink-0">{ach?.icon ?? '🎖️'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {ach?.title ?? achId}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {ach?.description ?? 'Achievement'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {!showStats && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">This user has hidden their statistics.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
