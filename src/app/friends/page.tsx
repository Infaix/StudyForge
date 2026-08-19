'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Input, Badge, EmptyState } from '@/components/ui';
import {
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getFriends,
  getReceivedRequests,
  getSentRequests,
  getFriendSuggestions,
  formatTimeAgo,
  type SearchResult,
  type FriendSuggestion,
} from '@/lib/social/socialService';
import { UserProfile, FriendRequest } from '@/types';

type Tab = 'friends' | 'received' | 'sent' | 'search' | 'suggestions';

function renderAvatar(profile: UserProfile, size: string = 'w-10 h-10') {
  if (profile.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={profile.displayName || profile.username}
        className={`${size} rounded-full object-cover`}
      />
    );
  }
  const name = profile.displayName || profile.username || 'U';
  const initials = name
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className={`${size} rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium flex-shrink-0`}>
      {initials}
    </div>
  );
}

export default function FriendsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<(FriendRequest & { fromProfile?: UserProfile | null })[]>([]);
  const [sentRequests, setSentRequests] = useState<(FriendRequest & { toProfile?: UserProfile | null })[]>([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !user) router.push('/login');
  }, [mounted, user, router]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    try {
      const result = await getFriends(user.id);
      setFriends(result);
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
  }, [user]);

  const loadReceivedRequests = useCallback(async () => {
    if (!user) return;
    try {
      const result = await getReceivedRequests(user.id);
      setReceivedRequests(result);
    } catch (err) {
      console.error('Failed to load received requests:', err);
    }
  }, [user]);

  const loadSentRequests = useCallback(async () => {
    if (!user) return;
    try {
      const result = await getSentRequests(user.id);
      setSentRequests(result);
    } catch (err) {
      console.error('Failed to load sent requests:', err);
    }
  }, [user]);

  const loadSuggestions = useCallback(async () => {
    if (!user) return;
    try {
      const result = await getFriendSuggestions(user.id);
      setSuggestions(result);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    }
  }, [user]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadFriends(), loadReceivedRequests(), loadSentRequests(), loadSuggestions()]);
    setLoading(false);
  }, [loadFriends, loadReceivedRequests, loadSentRequests, loadSuggestions]);

  useEffect(() => {
    if (mounted && user) loadAll();
  }, [mounted, user, loadAll]);

  const handleSearch = useCallback(async (query: string) => {
    if (!user || !query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchUsers(query, user.id);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [user]);

  const handleSearchInputChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleSearch(value);
    }, 300);
  }, [handleSearch]);

  const handleSendRequest = async (targetUser: UserProfile) => {
    if (!user) return;
    setActionLoading(targetUser.id);
    try {
      const result = await sendFriendRequest(user.id, targetUser.id);
      if (result.success) {
        await loadSentRequests();
        setSearchResults((prev) => prev.filter((r) => r.profile.id !== targetUser.id));
        await loadSuggestions();
      }
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
      await acceptFriendRequest(user.id, request);
      await Promise.all([loadFriends(), loadReceivedRequests(), loadSuggestions()]);
    } catch (err) {
      console.error('Failed to accept request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineRequest = async (request: FriendRequest) => {
    if (!user) return;
    setActionLoading(request.id);
    try {
      await declineFriendRequest(user.id, request);
      await loadReceivedRequests();
    } catch (err) {
      console.error('Failed to decline request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRequest = async (request: FriendRequest) => {
    if (!user) return;
    setActionLoading(request.id);
    try {
      await cancelFriendRequest(user.id, request);
      await loadSentRequests();
    } catch (err) {
      console.error('Failed to cancel request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to remove this friend?')) return;
    setActionLoading(friendId);
    try {
      await removeFriend(user.id, friendId);
      await Promise.all([loadFriends(), loadSuggestions()]);
    } catch (err) {
      console.error('Failed to remove friend:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (!mounted || !user) return null;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'friends', label: 'Friends', count: friends.length },
    { key: 'received', label: 'Requests', count: receivedRequests.length },
    { key: 'sent', label: 'Sent', count: sentRequests.length },
    { key: 'search', label: 'Find' },
    { key: 'suggestions', label: 'Suggestions' },
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
                <Badge variant="danger" className="ml-2">{tab.count}</Badge>
              )}
            </Button>
          ))}
        </div>

        {activeTab === 'search' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Find Friends</h2>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search by username or display name..."
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
              />

              {searching && (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">Searching...</p>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  {searchResults.map((result) => (
                    <div
                      key={result.profile.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                        onClick={() => router.push(`/profile/${result.profile.username}`)}
                      >
                        {renderAvatar(result.profile)}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {result.profile.displayName || result.profile.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            @{result.profile.username} · Level {result.profile.level}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        {result.status === 'friends' ? (
                          <Badge variant="success">Friends</Badge>
                        ) : result.status === 'pending_outgoing' ? (
                          <Badge variant="warning">Request Sent</Badge>
                        ) : result.status === 'pending_incoming' ? (
                          <div className="flex gap-1">
                            <Button variant="primary" size="sm" disabled>Accept</Button>
                            <Button variant="ghost" size="sm" disabled>Decline</Button>
                          </div>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleSendRequest(result.profile)}
                            disabled={actionLoading === result.profile.id}
                          >
                            {actionLoading === result.profile.id ? 'Sending...' : 'Add Friend'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchQuery && searchResults.length === 0 && (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  No users found matching &quot;{searchQuery}&quot;
                </p>
              )}

              {!searchQuery && !searching && (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  Type a username or display name to search for users.
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
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-1" />
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : friends.length === 0 ? (
                <EmptyState
                  icon={<span className="text-3xl">👥</span>}
                  title="No friends yet"
                  description="Search for other users and send them a friend request, or check out suggestions."
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
                      <div
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                        onClick={() => router.push(`/profile/${friend.username}`)}
                      >
                        {renderAvatar(friend)}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {friend.displayName || friend.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            @{friend.username} · Level {friend.level} · {friend.xp.toLocaleString()} XP
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFriend(friend.id)}
                        disabled={actionLoading === friend.id}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 flex-shrink-0 ml-3"
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
                      <div
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                        onClick={() => request.fromProfile && router.push(`/profile/${request.fromProfile.username}`)}
                      >
                        {request.fromProfile ? (
                          renderAvatar(request.fromProfile)
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm flex-shrink-0">?</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {request.fromProfile
                              ? request.fromProfile.displayName || request.fromProfile.username
                              : 'Unknown User'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTimeAgo(request.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
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
                      <div
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                        onClick={() => request.toProfile && router.push(`/profile/${request.toProfile.username}`)}
                      >
                        {request.toProfile ? (
                          renderAvatar(request.toProfile)
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm flex-shrink-0">?</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {request.toProfile
                              ? request.toProfile.displayName || request.toProfile.username
                              : 'Unknown User'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Sent {formatTimeAgo(request.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelRequest(request)}
                        disabled={actionLoading === request.id}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 flex-shrink-0 ml-3"
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

        {activeTab === 'suggestions' && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                People You May Know
              </h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>
              ) : suggestions.length === 0 ? (
                <EmptyState
                  icon={<span className="text-3xl">💡</span>}
                  title="No suggestions yet"
                  description="Add more subjects and complete study sessions to get friend suggestions based on shared interests."
                />
              ) : (
                <div className="space-y-3">
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion.profile.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                        onClick={() => router.push(`/profile/${suggestion.profile.username}`)}
                      >
                        {renderAvatar(suggestion.profile)}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {suggestion.profile.displayName || suggestion.profile.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            @{suggestion.profile.username} · Level {suggestion.profile.level}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {suggestion.mutualFriends > 0 && `${suggestion.mutualFriends} mutual friend${suggestion.mutualFriends !== 1 ? 's' : ''}`}
                            {suggestion.mutualFriends > 0 && suggestion.sharedSubjects.length > 0 && ' · '}
                            {suggestion.sharedSubjects.length > 0 && `${suggestion.sharedSubjects.length} shared subject${suggestion.sharedSubjects.length !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSendRequest(suggestion.profile)}
                        disabled={actionLoading === suggestion.profile.id}
                        className="flex-shrink-0 ml-3"
                      >
                        {actionLoading === suggestion.profile.id ? 'Sending...' : 'Add Friend'}
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
