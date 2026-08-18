'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Input, EmptyState, Badge } from '@/components/ui';
import { userProfileStorage, friendRequestStorage, studyActivityStorage } from '@/lib/storage';
import { UserProfile } from '@/types';

export default function FriendsPage() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [friends, setFriends] = useState<string[]>([]);
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newRequestMessage, setNewRequestMessage] = useState('');

  useEffect(() => {
    // Get user's friends
    userProfileStorage.get(user.id).then((profile) => {
      if (profile && profile.friends) {
        setFriends(profile.friends);
      }
    });
    
    // Get pending friend requests
    friendRequestStorage.getAllByUser(user.id).then((requests) => {
      setFriendRequests(requests.filter((r: any) => r.status === 'pending'));
    });
  }, [user]);

  const handleSearch = () => {
    // In a real app, this would search for users
    // For now, we'll just show an empty state
  };

  const addFriend = async (username: string) => {
    // Check if already friends
    // Check if already sent request
    // Send friend request
    setShowNewRequest(true);
    setNewRequestMessage(`Friend request sent to ${username}`);
  };

  const acceptFriendRequest = async (requestId: string) => {
    await friendRequestStorage.update(requestId, { status: 'accepted' });
    setFriendRequests((prev) => prev.filter((r: any) => r.id !== requestId));
    setFriends((prev) => [...prev, requestId]);
  };

  const declineFriendRequest = async (requestId: string) => {
    await friendRequestStorage.update(requestId, { status: 'declined' });
    setFriendRequests((prev) => prev.filter((r: any) => r.id !== requestId));
  };

  return (
    <DashboardLayout>
      <div className="p-4">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Friends
            </h2>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            {friends.length === 0 ? (
              <EmptyState
                icon={<span className="text-3xl">👤</span>}
                title="No friends yet"
                description="Search for users and add them as friends."
                action={{
                  label: 'Find Friends',
                  onClick: () => setShowNewRequest(true),
                }}
              />
            ) : (
              <div className="space-y-4">
                {friends.map((friendUsername) => {
                  return (
                    <div
                      key={friendUsername}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {friendUsername}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.alert('View profile')}
                      >
                        View
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Friend Requests
            </h3>
          </CardHeader>
          <CardContent>
            {friendRequests.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No pending requests</p>
            ) : (
              <div className="space-y-3">
                {friendRequests.map((request: any) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar would go here */}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {request.fromUsername || request.fromUserId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => acceptFriendRequest(request.id)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => declineFriendRequest(request.id)}
                      >
                        Decline
                      </Button>
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