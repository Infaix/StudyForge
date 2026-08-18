'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Input, Badge, EmptyState } from '@/components/ui';
import { userProfileStorage, friendRequestStorage } from '@/lib/storage';
import { UserProfile, FriendRequest } from '@/types';

type Tab = 'friends' | 'received' | 'sent' | 'search';

export default function FriendsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<(FriendRequest & { fromProfile?: UserProfile | null })[]>([]);
  const [sentRequests, setSentRequests] = useState<(FriendRequest & { toProfile?: UserProfile | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.push('/login');
    }
  }, [mounted, user, router]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await userProfileStorage.get(user.id);
      if (!profile || !profile.friends || profile.friends.length === 0) {
        setFriends([]);
        return;
      }
      const friendProfiles = await Promise.all(
        profile.friends.map(async (friendId) => {
          const p = await userProfileStorage.get(friendId);
          return p;
        })
      );
      setFriends(friendProfiles.filter((p): p is UserProfile => p !== null));
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
  }, [user]);

  const loadReceivedRequests = useCallback(async () => {
    if (!user) return;
    try {
      const requests = await friendRequestStorage.getAllByUser(user.id);
      const pending = requests.filter((r) => r.status === 'pending');
      const enriched = await Promise.all(
        pending.map(async (req) => {
          const fromProfile = await userProfileStorage.get(req.fromUserId);
          return { ...req, fromProfile };
        })
      );
      setReceivedRequests(enriched);
    } catch (err) {
      console.error('Failed to load received requests:', err);
    }
  }, [user]);

  const loadSentRequests = useCallback(async () => {
    if (!user) return;
    try {
      const requests = await friendRequestStorage.getAllSentByUser(user.id);
      const pending = requests.filter((r) => r.status === 'pending');
      const enriched = await Promise.all(
        pending.map(async (req) => {
          const toProfile = await userProfileStorage.get(req.toUserId);
          return { ...req, toProfile };
        })
      );
      setSentRequests(enriched);
    } catch (err) {
      console.error('Failed to load sent requests:', err);
    }
  }, [user]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadFriends(), loadReceivedRequests(), loadSentRequests()]);
    setLoading(false);
  }, [loadFriends, loadReceivedRequests, loadSentRequests]);

  useEffect(() => {
    if (mounted && user) {
      loadAll();
    }
  }, [mounted, user, loadAll]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    setSearching(true);
    try {
      const result = await userProfileStorage.getByUsername(searchQuery.trim());
      if (result && result.id !== user.id) {
        setSearchResults([result]);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetUser: UserProfile) => {
    if (!user) return;
    setActionLoading(targetUser.id);
    try {
      const request: FriendRequest = {
        id: `fr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromUserId: user.id,
        toUserId: targetUser.id,
        message: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await friendRequestStorage.create(request);
      await loadSentRequests();
      setSearchResults((prev) => prev.filter((u) => u.id !== targetUser.id));
    } catch (err) {
      console.error('Failed to send request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    if (!user) return;
    setActionLoading(request.id);
    try {
      await friendRequestStorage.update({ ...request, status: 'accepted' });

      const myProfile = await userProfileStorage.get(user.id);
      if (myProfile) {
        await userProfileStorage.update({
          ...myProfile,
          friends: [...(myProfile.friends || []), request.fromUserId],
          friendRequestsReceived: (myProfile.friendRequestsReceived || []).filter((id) => id !== request.fromUserId),
        });
      }

      const fromProfile = await userProfileStorage.get(request.fromUserId);
      if (fromProfile) {
        await userProfileStorage.update({
          ...fromProfile,
          friends: [...(fromProfile.friends || []), user.id],
          friendRequestsSent: (fromProfile.friendRequestsSent || []).filter((id) => id !== user.id),
        });
      }

      await Promise.all([loadFriends(), loadReceivedRequests()]);
    } catch (err) {
      console.error('Failed to accept request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineRequest = async (request: FriendRequest) => {
    setActionLoading(request.id);
    try {
      await friendRequestStorage.update({ ...request, status: 'declined' });
      await loadReceivedRequests();
    } catch (err) {
      console.error('Failed to decline request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRequest = async (request: FriendRequest) => {
    setActionLoading(request.id);
    try {
      await friendRequestStorage.update({ ...request, status: 'cancelled' });
      await loadSentRequests();
    } catch (err) {
      console.error('Failed to cancel request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!user) return;
    setActionLoading(friendId);
    try {
      const myProfile = await userProfileStorage.get(user.id);
      if (myProfile) {
        await userProfileStorage.update({
          ...myProfile,
          friends: myProfile.friends.filter((id) => id !== friendId),
        });
      }

      const friendProfile = await userProfileStorage.get(friendId);
      if (friendProfile) {
        await userProfileStorage.update({
          ...friendProfile,
          friends: friendProfile.friends.filter((id) => id !== user.id),
        });
      }

      await loadFriends();
    } catch (err) {
      console.error('Failed to remove friend:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getInitials = (profile: UserProfile) => {
    const name = profile.displayName || profile.username;
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderAvatar = (profile: UserProfile, size: string = 'w-10 h-10') => {
    if (profile.avatarUrl) {
      return (
        <img
          src={profile.avatarUrl}
          alt={profile.displayName || profile.username}
          className={`${size} rounded-full object-cover`}
        />
      );
    }
    return (
      <div className={`${size} rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium`}>
        {getInitials(profile)}
      </div>
    );
  };

  if (!mounted || !user) {
    return null;
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'friends', label: 'Friends', count: friends.length },
    { key: 'received', label: 'Received', count: receivedRequests.length },
    { key: 'sent', label: 'Sent', count: sentRequests.length },
    { key: 'search', label: 'Find' },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Friends</h1>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className="whitespace-nowrap"
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <Badge variant="danger" className="ml-2">
                  {tab.count}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        {activeTab === 'search' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Find Friends
              </h2>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                >
                  {searching ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  {searchResults.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex items-center gap-3">
                        {renderAvatar(profile)}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {profile.displayName || profile.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            @{profile.username} · Level {profile.level}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSendRequest(profile)}
                        disabled={actionLoading === profile.id}
                      >
                        {actionLoading === profile.id ? 'Sending...' : 'Add Friend'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && !searching && searchResults.length === 0 && (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  No users found matching &quot;{searchQuery}&quot;
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'friends' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                My Friends ({friends.length})
              </h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>
              ) : friends.length === 0 ? (
                <EmptyState
                  icon={<span className="text-3xl">👤</span>}
                  title="No friends yet"
                  description="Search for other users and send them a friend request."
                  action={{
                    label: 'Find Friends',
                    onClick: () => setActiveTab('search'),
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex items-center gap-3">
                        {renderAvatar(friend)}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {friend.displayName || friend.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            @{friend.username} · Level {friend.level}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFriend(friend.id)}
                        disabled={actionLoading === friend.id}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'received' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Friend Requests ({receivedRequests.length})
              </h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>
              ) : receivedRequests.length === 0 ? (
                <EmptyState
                  icon={<span className="text-3xl">📩</span>}
                  title="No pending requests"
                  description="When someone sends you a friend request, it will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {receivedRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex items-center gap-3">
                        {request.fromProfile ? (
                          renderAvatar(request.fromProfile)
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm">
                            ?
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {request.fromProfile
                              ? request.fromProfile.displayName || request.fromProfile.username
                              : request.fromUserId}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleAcceptRequest(request)}
                          disabled={actionLoading === request.id}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeclineRequest(request)}
                          disabled={actionLoading === request.id}
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
        )}

        {activeTab === 'sent' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Sent Requests ({sentRequests.length})
              </h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>
              ) : sentRequests.length === 0 ? (
                <EmptyState
                  icon={<span className="text-3xl">📤</span>}
                  title="No sent requests"
                  description="Friend requests you send will appear here until they are accepted."
                  action={{
                    label: 'Find Friends',
                    onClick: () => setActiveTab('search'),
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {sentRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex items-center gap-3">
                        {request.toProfile ? (
                          renderAvatar(request.toProfile)
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm">
                            ?
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {request.toProfile
                              ? request.toProfile.displayName || request.toProfile.username
                              : request.toUserId}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Sent {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelRequest(request)}
                        disabled={actionLoading === request.id}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
