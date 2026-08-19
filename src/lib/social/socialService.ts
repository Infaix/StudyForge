import {
  UserProfile,
  FriendRequest,
  StudyActivity,
  Notification,
  XpTransaction,
  StudySession,
  PrivacySettings,
  DEFAULT_PRIVACY_SETTINGS,
} from '@/types';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function getProfileById(id: string): Promise<UserProfile | null> {
  try {
    if (id === 'current-user') {
      const data = await api<{ user: UserProfile }>('/api/auth/me');
      return data.user ? migrateProfile(data.user) : null;
    }
    const p = await api<UserProfile>(`/api/data/user-profiles/${id}`);
    return p ? migrateProfile(p) : null;
  } catch {
    return null;
  }
}

function migrateProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    bio: profile.bio ?? '',
    privacy: profile.privacy ?? { ...DEFAULT_PRIVACY_SETTINGS },
    friends: profile.friends ?? [],
    friendRequestsReceived: profile.friendRequestsReceived ?? [],
    friendRequestsSent: profile.friendRequestsSent ?? [],
    groups: profile.groups ?? [],
    achievements: profile.achievements ?? [],
  };
}

export type FriendshipStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

export interface SearchResult {
  profile: UserProfile;
  status: FriendshipStatus;
}

export interface LeaderboardEntry {
  rank: number;
  profile: UserProfile;
  xp: number;
  studyTime: number;
  streak: number;
  isCurrentUser: boolean;
}

export type LeaderboardCategory = 'xp' | 'studyTime' | 'streak';
export type LeaderboardPeriod = 'all-time' | 'this-week' | 'this-month';

export interface FriendSuggestion {
  profile: UserProfile;
  mutualFriends: number;
  sharedSubjects: string[];
}

export async function getFriendshipStatus(
  currentUserId: string,
  targetUserId: string
): Promise<FriendshipStatus> {
  const currentProfile = await getProfileById(currentUserId);
  if (!currentProfile) return 'none';

  if (currentProfile.friends?.includes(targetUserId)) return 'friends';

  const sent = currentProfile.friendRequestsSent || [];
  if (sent.includes(targetUserId)) return 'pending_outgoing';

  const received = currentProfile.friendRequestsReceived || [];
  if (received.includes(targetUserId)) return 'pending_incoming';

  return 'none';
}

export async function sendFriendRequest(
  fromUserId: string,
  toUserId: string
): Promise<{ success: boolean; error?: string }> {
  if (fromUserId === toUserId) {
    return { success: false, error: 'Cannot send a friend request to yourself' };
  }
  try {
    await api('/api/social/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId, action: 'request' }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function acceptFriendRequest(
  currentUserId: string,
  request: FriendRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    await api('/api/social/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept', requestId: request.id }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function declineFriendRequest(
  currentUserId: string,
  request: FriendRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    await api('/api/social/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline', requestId: request.id }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function cancelFriendRequest(
  currentUserId: string,
  request: FriendRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    await api('/api/data/friend-requests/' + request.id, {
      method: 'DELETE',
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function removeFriend(
  currentUserId: string,
  friendId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await api('/api/social/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', friendId }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function searchUsers(
  query: string,
  currentUserId: string
): Promise<SearchResult[]> {
  if (query.trim().length < 1) return [];
  try {
    const users = await api<Array<{ id: string; username: string; displayName: string; avatarUrl: string | null; bio: string; xp: number; level: number }>>(
      `/api/social/search?q=${encodeURIComponent(query)}`
    );
    const profile = await getProfileById(currentUserId);
    const friendSet = new Set(profile?.friends || []);
    const sentSet = new Set(profile?.friendRequestsSent || []);
    const receivedSet = new Set(profile?.friendRequestsReceived || []);

    return users.map((u) => {
      let status: FriendshipStatus = 'none';
      if (friendSet.has(u.id)) status = 'friends';
      else if (sentSet.has(u.id)) status = 'pending_outgoing';
      else if (receivedSet.has(u.id)) status = 'pending_incoming';

      return {
        profile: {
          ...u,
          bio: u.bio || '',
          avatarUrl: u.avatarUrl,
          privacy: DEFAULT_PRIVACY_SETTINGS,
          friends: [],
          friendRequestsReceived: [],
          friendRequestsSent: [],
          groups: [],
          achievements: [],
          streak: 0,
          studyTimeToday: 0,
          studyTimeThisWeek: 0,
          studyTimeThisMonth: 0,
          studyTimeAllTime: 0,
          createdAt: '',
          updatedAt: '',
        } as UserProfile,
        status,
      };
    });
  } catch {
    return [];
  }
}

export async function getFriends(userId: string): Promise<UserProfile[]> {
  try {
    const friends = await api<Array<{ id: string; username: string; displayName: string; avatarUrl: string | null; xp: number; level: number; streak: number; studyTime: number }>>(
      '/api/social/friends'
    );
    return friends.map((f) => ({
      id: f.id,
      username: f.username,
      displayName: f.displayName || f.username,
      avatarUrl: f.avatarUrl,
      bio: '',
      xp: f.xp || 0,
      level: f.level || 1,
      streak: f.streak || 0,
      studyTimeToday: 0,
      studyTimeThisWeek: 0,
      studyTimeThisMonth: 0,
      studyTimeAllTime: f.studyTime || 0,
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: [],
      groups: [],
      achievements: [],
      privacy: DEFAULT_PRIVACY_SETTINGS,
      createdAt: '',
      updatedAt: '',
    }));
  } catch {
    return [];
  }
}

export async function getReceivedRequests(
  userId: string
): Promise<(FriendRequest & { fromProfile?: UserProfile | null })[]> {
  try {
    const profile = await getProfileById(userId);
    if (!profile) return [];
    const incomingIds = profile.friendRequestsReceived || [];
    const requests: (FriendRequest & { fromProfile?: UserProfile | null })[] = [];
    for (const fromId of incomingIds) {
      const fromProfile = await getProfileById(fromId);
      requests.push({
        id: `fr-${fromId}-${userId}`,
        fromUserId: fromId,
        toUserId: userId,
        message: null,
        status: 'pending',
        createdAt: '',
        fromProfile,
      });
    }
    return requests;
  } catch {
    return [];
  }
}

export async function getSentRequests(
  userId: string
): Promise<(FriendRequest & { toProfile?: UserProfile | null })[]> {
  try {
    const profile = await getProfileById(userId);
    if (!profile) return [];
    const outgoingIds = profile.friendRequestsSent || [];
    const requests: (FriendRequest & { toProfile?: UserProfile | null })[] = [];
    for (const toId of outgoingIds) {
      const toProfile = await getProfileById(toId);
      requests.push({
        id: `fr-${userId}-${toId}`,
        fromUserId: userId,
        toUserId: toId,
        message: null,
        status: 'pending',
        createdAt: '',
        toProfile,
      });
    }
    return requests;
  } catch {
    return [];
  }
}

export async function createNotification(
  userId: string,
  type: Notification['type'],
  title: string,
  message: string,
  relatedId: string | null = null
): Promise<void> {
  await api('/api/social/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: generateId('notif'),
      userId,
      type,
      title,
      message,
      read: false,
      relatedId,
      createdAt: new Date().toISOString(),
    }),
  }).catch(() => {});
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  try {
    return await api<Notification[]>('/api/social/notifications');
  } catch {
    return [];
  }
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const notifications = await getNotifications(userId);
  return notifications.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api('/api/social/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId: id, action: 'markRead' }),
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await api('/api/social/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead' }),
  });
}

export async function generateActivity(
  userId: string,
  type: StudyActivity['type'],
  title: string,
  description: string | null,
  durationMinutes: number | null,
  xpAwarded: number,
  subjectId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await api('/api/data/study-activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: generateId('act'),
      userId,
      type,
      title,
      description,
      durationMinutes,
      xpAwarded,
      subjectId,
      metadata,
      createdAt: new Date().toISOString(),
    }),
  }).catch(() => {});
}

export async function getUserActivity(
  userId: string,
  limit: number = 20
): Promise<StudyActivity[]> {
  try {
    const activities = await api<StudyActivity[]>(`/api/data/study-activities?userId=${userId}&limit=${limit}`);
    return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function getFriendActivity(
  userId: string,
  limit: number = 50
): Promise<(StudyActivity & { userProfile?: UserProfile | null })[]> {
  try {
    const activities = await api<(StudyActivity & { user?: { username: string; displayName: string; avatarUrl: string | null } })[]>(
      '/api/social/activities'
    );
    return activities.slice(0, limit).map((a) => ({
      ...a,
      userProfile: a.user ? {
        id: a.userId,
        username: a.user.username,
        displayName: a.user.displayName || a.user.username,
        avatarUrl: a.user.avatarUrl,
        bio: '',
        xp: 0,
        level: 1,
        streak: 0,
        studyTimeToday: 0,
        studyTimeThisWeek: 0,
        studyTimeThisMonth: 0,
        studyTimeAllTime: 0,
        friends: [],
        friendRequestsReceived: [],
        friendRequestsSent: [],
        groups: [],
        achievements: [],
        privacy: DEFAULT_PRIVACY_SETTINGS,
        createdAt: '',
        updatedAt: '',
      } as UserProfile : null,
    }));
  } catch {
    return [];
  }
}

export async function computeLeaderboard(
  period: LeaderboardPeriod,
  category: LeaderboardCategory,
  currentUserId: string,
  _friendIds?: string[]
): Promise<LeaderboardEntry[]> {
  try {
    return await api<LeaderboardEntry[]>(
      `/api/social/leaderboard?category=${category}&period=${period}`
    );
  } catch {
    return [];
  }
}

export async function getFriendSuggestions(
  userId: string
): Promise<FriendSuggestion[]> {
  const currentProfile = await getProfileById(userId);
  if (!currentProfile) return [];

  const excludedIds = new Set([
    userId,
    ...(currentProfile.friends || []),
    ...(currentProfile.friendRequestsSent || []),
    ...(currentProfile.friendRequestsReceived || []),
  ]);

  try {
    const allUsers = await api<Array<{ id: string; username: string; displayName: string }>>(
      '/api/social/search?q='
    );

    const suggestions: FriendSuggestion[] = [];
    for (const u of allUsers) {
      if (excludedIds.has(u.id)) continue;
      suggestions.push({
        profile: {
          id: u.id,
          username: u.username,
          displayName: u.displayName || u.username,
          avatarUrl: null,
          bio: '',
          xp: 0,
          level: 1,
          streak: 0,
          studyTimeToday: 0,
          studyTimeThisWeek: 0,
          studyTimeThisMonth: 0,
          studyTimeAllTime: 0,
          friends: [],
          friendRequestsReceived: [],
          friendRequestsSent: [],
          groups: [],
          achievements: [],
          privacy: DEFAULT_PRIVACY_SETTINGS,
          createdAt: '',
          updatedAt: '',
        },
        mutualFriends: 0,
        sharedSubjects: [],
      });
    }
    return suggestions.slice(0, 10);
  } catch {
    return [];
  }
}

export function canViewProfile(viewerId: string | null, profileOwner: UserProfile): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.profilePublic !== false) return true;
  return false;
}

export function canViewStats(viewerId: string | null, profileOwner: UserProfile): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.showStats === false) return false;
  return profileOwner.privacy?.profilePublic !== false;
}

export function canViewActivity(viewerId: string | null, profileOwner: UserProfile): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.showActivity === false) return false;
  return profileOwner.privacy?.profilePublic !== false;
}

export function canViewLeaderboardStats(viewerId: string | null, profileOwner: UserProfile): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.showLeaderboardStats === false) return false;
  return profileOwner.privacy?.profilePublic !== false;
}

export function canViewSubjects(viewerId: string | null, profileOwner: UserProfile): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.showSubjects === false) return false;
  return profileOwner.privacy?.profilePublic !== false;
}

export async function awardXP(
  userId: string,
  amount: number,
  reason: string,
  relatedId: string | null = null
): Promise<{ newTotal: number; newLevel: number; leveledUp: boolean }> {
  const profile = await getProfileById(userId);
  if (!profile) return { newTotal: 0, newLevel: 1, leveledUp: false };

  await api('/api/data/xp-transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: generateId('xp'),
      userId,
      amount,
      reason,
      relatedId,
      createdAt: new Date().toISOString(),
    }),
  });

  const newTotal = profile.xp + amount;
  const newLevel = Math.floor(newTotal / 100) + 1;
  const leveledUp = newLevel > profile.level;

  await api(`/api/data/user-profiles/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xp: newTotal, level: newLevel, updatedAt: new Date().toISOString() }),
  });

  if (leveledUp) {
    await createNotification(userId, 'level_up', 'Level Up!', `Congratulations! You reached Level ${newLevel}!`, null);
    await generateActivity(userId, 'level_up', `Reached Level ${newLevel}`, null, null, 0, null, { newLevel });
  }

  return { newTotal, newLevel, leveledUp };
}

export async function recordStudySessionComplete(
  userId: string,
  session: StudySession,
  subjectName: string
): Promise<void> {
  const profile = await getProfileById(userId);
  if (!profile) return;

  const minutes = session.duration;
  const xpAmount = Math.max(10, minutes * 2);

  await api(`/api/data/user-profiles/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studyTimeToday: profile.studyTimeToday + minutes,
      studyTimeThisWeek: profile.studyTimeThisWeek + minutes,
      studyTimeThisMonth: profile.studyTimeThisMonth + minutes,
      studyTimeAllTime: profile.studyTimeAllTime + minutes,
      updatedAt: new Date().toISOString(),
    }),
  });

  await awardXP(userId, xpAmount, `Studied ${subjectName} for ${minutes} minutes`, session.id);
  await generateActivity(userId, 'study_session', `Studied ${subjectName}`, `Completed a ${minutes}-minute study session`, minutes, xpAmount, session.subjectId, { sessionId: session.id });
}

export function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function formatStudyTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
