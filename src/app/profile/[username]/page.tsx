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
  Badge,
  Progress,
} from '@/components/ui';
import { userProfileStorage } from '@/lib/storage';

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const router = useRouter();

  if (!username) {
    router.push('/');
    return null;
  }

  const [targetUser, setTargetUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, [username]);

  const loadUserProfile = async () => {
    try {
      const user = await userProfileStorage.getByUsername(username);
      setTargetUser(user);
    } catch (error) {
      console.error('Failed to load user profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !targetUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="bg-white rounded-xl p-8 max-w-md w-full dark:bg-gray-800 shadow-lg">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Loading Profile</h2>
            </CardHeader>
            <CardContent>Loading user profile...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If viewing own profile, redirect to /profile
  if (user?.username === username && router) {
    router.push('/profile');
    return null;
  }

  const isFriends = user?.friends?.includes(targetUser?.id ?? '') ?? false;
  const hasSentRequest = user?.friendRequestsSent?.includes(targetUser?.id ?? '') ?? false;
  const hasReceivedRequest = user?.friendRequestsReceived?.includes(targetUser?.id ?? '') ?? false;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          {targetUser.avatarUrl ? (
            <img
              src={targetUser.avatarUrl}
              alt={targetUser.displayName || targetUser.username}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <Badge className="w-10 h-10 rounded-full flex items-center justify-center text-xl">
              {targetUser.username ? targetUser.username[0].toUpperCase() : 'U'}
            </Badge>
          )}

          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {targetUser.displayName || targetUser.username}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatStudyTime(targetUser.studyTimeAllTime)} total study
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {targetUser ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Study streak</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {targetUser.streak} {targetUser.streak === 1 ? 'day' : 'days'}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">XP</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {targetUser.xp} XP
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Level</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">Level {targetUser.level}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Study time this week</p>
              <p className="text-lg text-gray-900 dark:text-white">
                {formatStudyTime(targetUser.studyTimeThisWeek)}
              </p>
            </div>

            {user && user.id !== targetUser.id && (
              <div>
                {hasSentRequest ? (
                  <Button variant="ghost" size="sm">Request Sent</Button>
                ) : hasReceivedRequest ? (
                  <Button variant="ghost" size="sm">Accept Request</Button>
                ) : isFriends ? (
                  <Button variant="secondary" size="sm">Friends</Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      // Send friend request
                      const { friendRequestStorage } = await import('@/lib/storage');
                      const request: any = {
                        id: 'req-' + Date.now(),
                        fromUserId: user?.id ?? '',
                        toUserId: targetUser.id,
                        message: null,
                        createdAt: new Date().toISOString(),
                        status: 'pending',
                      };
                      await friendRequestStorage.create(request);
                      // Show feedback
                      alert('Friend request sent!');
                    }}
                  >
                    Add Friend
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<span className="text-6xl">👤</span>}
            title="User not found"
            description="The profile you are looking for does not exist."
          />
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