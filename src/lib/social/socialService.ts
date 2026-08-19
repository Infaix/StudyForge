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
import {
  userProfileStorage,
  friendRequestStorage,
  studyActivityStorage,
  notificationStorage,
  xpTransactionStorage,
  studySessionStorage,
} from '@/lib/storage';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
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

function migrateProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    bio: profile.bio ?? '',
    privacy: profile.privacy ?? { ...DEFAULT_PRIVACY_SETTINGS },
  };
}

async function getProfileById(id: string): Promise<UserProfile | null> {
  if (id === 'current-user') {
    const p = await userProfileStorage.get('current-user');
    return p ? migrateProfile(p) : null;
  }
  const p = await userProfileStorage.get(id);
  return p ? migrateProfile(p) : null;
}

async function getAllProfiles(): Promise<UserProfile[]> {
  const all = await userProfileStorage.getAll();
  return all.map(migrateProfile);
}

export async function getFriendshipStatus(
  currentUserId: string,
  targetUserId: string
): Promise<FriendshipStatus> {
  const currentProfile = await getProfileById(currentUserId);
  if (!currentProfile) return 'none';

  if (currentProfile.friends?.includes(targetUserId)) {
    return 'friends';
  }

  const sentRequests = await friendRequestStorage.getAllSentByUser(currentUserId);
  const outgoingPending = sentRequests.find(
    (r) => r.toUserId === targetUserId && r.status === 'pending'
  );
  if (outgoingPending) return 'pending_outgoing';

  const receivedRequests = await friendRequestStorage.getAllByUser(currentUserId);
  const incomingPending = receivedRequests.find(
    (r) => r.fromUserId === targetUserId && r.status === 'pending'
  );
  if (incomingPending) return 'pending_incoming';

  return 'none';
}

export async function sendFriendRequest(
  fromUserId: string,
  toUserId: string
): Promise<{ success: boolean; error?: string }> {
  if (fromUserId === toUserId) {
    return { success: false, error: 'Cannot send a friend request to yourself' };
  }

  const fromProfile = await getProfileById(fromUserId);
  const toProfile = await getProfileById(toUserId);
  if (!fromProfile || !toProfile) {
    return { success: false, error: 'User not found' };
  }

  if (fromProfile.friends?.includes(toUserId)) {
    return { success: false, error: 'Already friends' };
  }

  const sentRequests = await friendRequestStorage.getAllSentByUser(fromUserId);
  const existingOutgoing = sentRequests.find(
    (r) => r.toUserId === toUserId && r.status === 'pending'
  );
  if (existingOutgoing) {
    return { success: false, error: 'Request already sent' };
  }

  const receivedRequests = await friendRequestStorage.getAllByUser(fromUserId);
  const existingIncoming = receivedRequests.find(
    (r) => r.fromUserId === toUserId && r.status === 'pending'
  );
  if (existingIncoming) {
    return { success: false, error: 'This user has already sent you a request' };
  }

  const request: FriendRequest = {
    id: generateId('fr'),
    fromUserId,
    toUserId,
    message: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await friendRequestStorage.create(request);

  await userProfileStorage.update({
    ...toProfile,
    friendRequestsReceived: [...(toProfile.friendRequestsReceived || []), fromUserId],
    updatedAt: new Date().toISOString(),
  });

  await userProfileStorage.update({
    ...fromProfile,
    friendRequestsSent: [...(fromProfile.friendRequestsSent || []), toUserId],
    updatedAt: new Date().toISOString(),
  });

  await createNotification(toUserId, 'friend_request', 'Friend Request',
    `${fromProfile.displayName || fromProfile.username} sent you a friend request`, request.id);

  return { success: true };
}

export async function acceptFriendRequest(
  currentUserId: string,
  request: FriendRequest
): Promise<{ success: boolean; error?: string }> {
  const currentProfile = await getProfileById(currentUserId);
  const fromProfile = await getProfileById(request.fromUserId);
  if (!currentProfile || !fromProfile) {
    return { success: false, error: 'User not found' };
  }

  await friendRequestStorage.update({ ...request, status: 'accepted' });

  await userProfileStorage.update({
    ...currentProfile,
    friends: [...(currentProfile.friends || []), request.fromUserId],
    friendRequestsReceived: (currentProfile.friendRequestsReceived || []).filter(
      (id) => id !== request.fromUserId
    ),
    updatedAt: new Date().toISOString(),
  });

  await userProfileStorage.update({
    ...fromProfile,
    friends: [...(fromProfile.friends || []), currentUserId],
    friendRequestsSent: (fromProfile.friendRequestsSent || []).filter(
      (id) => id !== currentUserId
    ),
    updatedAt: new Date().toISOString(),
  });

  await createNotification(
    request.fromUserId,
    'friend_request_accepted',
    'Friend Request Accepted',
    `${currentProfile.displayName || currentProfile.username} accepted your friend request`,
    currentUserId
  );

  return { success: true };
}

export async function declineFriendRequest(
  currentUserId: string,
  request: FriendRequest
): Promise<{ success: boolean; error?: string }> {
  const currentProfile = await getProfileById(currentUserId);
  if (!currentProfile) return { success: false, error: 'User not found' };

  await friendRequestStorage.update({ ...request, status: 'declined' });

  await userProfileStorage.update({
    ...currentProfile,
    friendRequestsReceived: (currentProfile.friendRequestsReceived || []).filter(
      (id) => id !== request.fromUserId
    ),
    updatedAt: new Date().toISOString(),
  });

  const fromProfile = await getProfileById(request.fromUserId);
  if (fromProfile) {
    await userProfileStorage.update({
      ...fromProfile,
      friendRequestsSent: (fromProfile.friendRequestsSent || []).filter(
        (id) => id !== currentUserId
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  return { success: true };
}

export async function cancelFriendRequest(
  currentUserId: string,
  request: FriendRequest
): Promise<{ success: boolean; error?: string }> {
  const currentProfile = await getProfileById(currentUserId);
  if (!currentProfile) return { success: false, error: 'User not found' };

  await friendRequestStorage.update({ ...request, status: 'cancelled' });

  await userProfileStorage.update({
    ...currentProfile,
    friendRequestsSent: (currentProfile.friendRequestsSent || []).filter(
      (id) => id !== request.toUserId
    ),
    updatedAt: new Date().toISOString(),
  });

  const toProfile = await getProfileById(request.toUserId);
  if (toProfile) {
    await userProfileStorage.update({
      ...toProfile,
      friendRequestsReceived: (toProfile.friendRequestsReceived || []).filter(
        (id) => id !== currentUserId
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  return { success: true };
}

export async function removeFriend(
  currentUserId: string,
  friendId: string
): Promise<{ success: boolean; error?: string }> {
  const currentProfile = await getProfileById(currentUserId);
  const friendProfile = await getProfileById(friendId);
  if (!currentProfile || !friendProfile) {
    return { success: false, error: 'User not found' };
  }

  await userProfileStorage.update({
    ...currentProfile,
    friends: (currentProfile.friends || []).filter((id) => id !== friendId),
    updatedAt: new Date().toISOString(),
  });

  await userProfileStorage.update({
    ...friendProfile,
    friends: (friendProfile.friends || []).filter((id) => id !== currentUserId),
    updatedAt: new Date().toISOString(),
  });

  return { success: true };
}

export async function searchUsers(
  query: string,
  currentUserId: string
): Promise<SearchResult[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 1) return [];

  const allProfiles = await getAllProfiles();
  const currentProfile = await getProfileById(currentUserId);

  const matches = allProfiles.filter((p) => {
    if (p.id === currentUserId) return false;
    if (p.id === 'current-user') return false;
    const username = (p.username || '').toLowerCase();
    const displayName = (p.displayName || '').toLowerCase();
    return username.includes(trimmed) || displayName.includes(trimmed);
  });

  const results: SearchResult[] = await Promise.all(
    matches.slice(0, 20).map(async (profile) => {
      let status: FriendshipStatus = 'none';

      if (currentProfile?.friends?.includes(profile.id)) {
        status = 'friends';
      } else {
        const sentRequests = currentProfile
          ? await friendRequestStorage.getAllSentByUser(currentUserId)
          : [];
        const outgoing = sentRequests.find(
          (r) => r.toUserId === profile.id && r.status === 'pending'
        );
        if (outgoing) {
          status = 'pending_outgoing';
        } else {
          const receivedRequests = currentProfile
            ? await friendRequestStorage.getAllByUser(currentUserId)
            : [];
          const incoming = receivedRequests.find(
            (r) => r.fromUserId === profile.id && r.status === 'pending'
          );
          if (incoming) status = 'pending_incoming';
        }
      }

      return { profile, status };
    })
  );

  return results;
}

export async function getFriends(userId: string): Promise<UserProfile[]> {
  const profile = await getProfileById(userId);
  if (!profile || !profile.friends || profile.friends.length === 0) return [];

  const friendProfiles = await Promise.all(
    profile.friends.map(async (friendId) => {
      const p = await getProfileById(friendId);
      return p;
    })
  );

  return friendProfiles.filter((p): p is UserProfile => p !== null);
}

export async function getReceivedRequests(
  userId: string
): Promise<(FriendRequest & { fromProfile?: UserProfile | null })[]> {
  const requests = await friendRequestStorage.getAllByUser(userId);
  const pending = requests.filter((r) => r.status === 'pending');

  return Promise.all(
    pending.map(async (req) => {
      const fromProfile = await getProfileById(req.fromUserId);
      return { ...req, fromProfile };
    })
  );
}

export async function getSentRequests(
  userId: string
): Promise<(FriendRequest & { toProfile?: UserProfile | null })[]> {
  const requests = await friendRequestStorage.getAllSentByUser(userId);
  const pending = requests.filter((r) => r.status === 'pending');

  return Promise.all(
    pending.map(async (req) => {
      const toProfile = await getProfileById(req.toUserId);
      return { ...req, toProfile };
    })
  );
}

export async function createNotification(
  userId: string,
  type: Notification['type'],
  title: string,
  message: string,
  relatedId: string | null = null
): Promise<void> {
  const notification: Notification = {
    id: generateId('notif'),
    userId,
    type,
    title,
    message,
    read: false,
    relatedId,
    createdAt: new Date().toISOString(),
  };
  await notificationStorage.create(notification);
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const notifications = await notificationStorage.getAllByUser(userId);
  return notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const notifications = await notificationStorage.getAllByUser(userId);
  return notifications.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string): Promise<void> {
  await notificationStorage.markRead(id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await notificationStorage.markAllRead(userId);
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
  const activity: StudyActivity = {
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
  };
  await studyActivityStorage.create(activity);
}

export async function getUserActivity(
  userId: string,
  limit: number = 20
): Promise<StudyActivity[]> {
  const activities = await studyActivityStorage.getAllByUser(userId);
  return activities
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function getFriendActivity(
  userId: string,
  limit: number = 50
): Promise<(StudyActivity & { userProfile?: UserProfile | null })[]> {
  const profile = await getProfileById(userId);
  if (!profile || !profile.friends || profile.friends.length === 0) return [];

  const friendIds = profile.friends;

  const allActivities: (StudyActivity & { userProfile?: UserProfile | null })[] = [];

  for (const friendId of friendIds) {
    const friendProfile = await getProfileById(friendId);
    if (!friendProfile) continue;

    const showActivity = friendProfile.privacy?.showActivity !== false;
    if (!showActivity && friendProfile.privacy?.profilePublic === false) continue;

    const activities = await studyActivityStorage.getAllByUser(friendId);
    const recent = activities
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    for (const act of recent) {
      allActivities.push({ ...act, userProfile: friendProfile });
    }
  }

  return allActivities
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function computeLeaderboard(
  period: LeaderboardPeriod,
  category: LeaderboardCategory,
  currentUserId: string,
  friendIds?: string[]
): Promise<LeaderboardEntry[]> {
  const allProfiles = await getAllProfiles();
  const allSessions = await studySessionStorage.getAll();
  const allTransactions = await xpTransactionStorage.getAll();

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now);
  monthStart.setMonth(monthStart.getMonth() - 1);
  monthStart.setHours(0, 0, 0, 0);

  const filteredProfiles = friendIds
    ? allProfiles.filter(
        (p) => friendIds.includes(p.id) || p.id === currentUserId
      )
    : allProfiles;

  const computed: LeaderboardEntry[] = filteredProfiles
    .filter((p) => p.id !== 'current-user')
    .map((profile) => {
      let xp = profile.xp;
      let studyTime = profile.studyTimeAllTime;
      let streak = profile.streak;

      if (period === 'this-week') {
        const userTransactions = allTransactions.filter(
          (t: XpTransaction) => t.userId === profile.id && new Date(t.createdAt) >= weekStart
        );
        xp = userTransactions.reduce((sum: number, t: XpTransaction) => sum + t.amount, 0);

        const userSessions = allSessions.filter(
          (s: StudySession) =>
            s.startTime && new Date(s.startTime) >= weekStart
        );
        studyTime = userSessions.reduce(
          (sum: number, s: StudySession) => sum + s.duration,
          0
        );
      } else if (period === 'this-month') {
        const userTransactions = allTransactions.filter(
          (t: XpTransaction) => t.userId === profile.id && new Date(t.createdAt) >= monthStart
        );
        xp = userTransactions.reduce((sum: number, t: XpTransaction) => sum + t.amount, 0);

        const userSessions = allSessions.filter(
          (s: StudySession) =>
            s.startTime && new Date(s.startTime) >= monthStart
        );
        studyTime = userSessions.reduce(
          (sum: number, s: StudySession) => sum + s.duration,
          0
        );
      }

      return {
        rank: 0,
        profile,
        xp,
        studyTime,
        streak,
        isCurrentUser: profile.id === currentUserId,
      };
    });

  computed.sort((a, b) => {
    if (category === 'xp') return b.xp - a.xp;
    if (category === 'studyTime') return b.studyTime - a.studyTime;
    return b.streak - a.streak;
  });

  const ranked = computed.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  return ranked;
}

export async function getFriendSuggestions(
  userId: string
): Promise<FriendSuggestion[]> {
  const currentProfile = await getProfileById(userId);
  if (!currentProfile) return [];

  const allProfiles = await getAllProfiles();

  const excludedIds = new Set([
    userId,
    'current-user',
    ...(currentProfile.friends || []),
    ...(currentProfile.friendRequestsSent || []),
    ...(currentProfile.friendRequestsReceived || []),
  ]);

  const suggestions: FriendSuggestion[] = [];

  for (const profile of allProfiles) {
    if (excludedIds.has(profile.id)) continue;

    const theirSessions = await studyActivityStorage.getAllByUser(profile.id);
    const theirSubjectIds = new Set(
      theirSessions
        .filter((s): s is typeof s & { subjectId: string } => !!s.subjectId)
        .map((s) => s.subjectId)
    );

    const mySessions = await studyActivityStorage.getAllByUser(userId);
    const mySubjectIds = new Set(
      mySessions
        .filter((s): s is typeof s & { subjectId: string } => !!s.subjectId)
        .map((s) => s.subjectId)
    );

    const sharedSubjects: string[] = [];
    for (const sid of mySubjectIds) {
      if (theirSubjectIds.has(sid)) sharedSubjects.push(sid);
    }

    const mutualFriends = await computeMutualFriends(userId, profile.id);

    if (mutualFriends > 0 || sharedSubjects.length > 0) {
      suggestions.push({
        profile,
        mutualFriends,
        sharedSubjects,
      });
    }
  }

  suggestions.sort((a, b) => b.mutualFriends - a.mutualFriends || b.sharedSubjects.length - a.sharedSubjects.length);

  return suggestions.slice(0, 10);
}

async function computeMutualFriends(userId: string, otherId: string): Promise<number> {
  const userProfile = await getProfileById(userId);
  const otherProfile = await getProfileById(otherId);

  if (!userProfile || !otherProfile) return 0;

  const myFriends = new Set(userProfile.friends || []);
  const theirFriends = new Set(otherProfile.friends || []);

  let count = 0;
  for (const fid of myFriends) {
    if (theirFriends.has(fid)) count++;
  }
  return count;
}

export function canViewProfile(
  viewerId: string | null,
  profileOwner: UserProfile
): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.profilePublic !== false) return true;
  return false;
}

export function canViewStats(
  viewerId: string | null,
  profileOwner: UserProfile
): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.showStats === false) return false;
  return profileOwner.privacy?.profilePublic !== false;
}

export function canViewActivity(
  viewerId: string | null,
  profileOwner: UserProfile
): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.showActivity === false) return false;
  return profileOwner.privacy?.profilePublic !== false;
}

export function canViewLeaderboardStats(
  viewerId: string | null,
  profileOwner: UserProfile
): boolean {
  if (viewerId === profileOwner.id) return true;
  if (profileOwner.privacy?.showLeaderboardStats === false) return false;
  return profileOwner.privacy?.profilePublic !== false;
}

export function canViewSubjects(
  viewerId: string | null,
  profileOwner: UserProfile
): boolean {
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

  const transaction: XpTransaction = {
    id: generateId('xp'),
    userId,
    amount,
    reason,
    relatedId,
    createdAt: new Date().toISOString(),
  };
  await xpTransactionStorage.create(transaction);

  const newTotal = profile.xp + amount;
  const newLevel = Math.floor(newTotal / 100) + 1;
  const leveledUp = newLevel > profile.level;

  await userProfileStorage.update({
    ...profile,
    xp: newTotal,
    level: newLevel,
    updatedAt: new Date().toISOString(),
  });

  if (leveledUp) {
    await createNotification(
      userId,
      'level_up',
      'Level Up!',
      `Congratulations! You reached Level ${newLevel}!`,
      null
    );
    await generateActivity(
      userId,
      'level_up',
      `Reached Level ${newLevel}`,
      null,
      null,
      0,
      null,
      { newLevel }
    );
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

  await userProfileStorage.update({
    ...profile,
    studyTimeToday: profile.studyTimeToday + minutes,
    studyTimeThisWeek: profile.studyTimeThisWeek + minutes,
    studyTimeThisMonth: profile.studyTimeThisMonth + minutes,
    studyTimeAllTime: profile.studyTimeAllTime + minutes,
    updatedAt: new Date().toISOString(),
  });

  const { leveledUp } = await awardXP(
    userId,
    xpAmount,
    `Studied ${subjectName} for ${minutes} minutes`,
    session.id
  );

  await generateActivity(
    userId,
    'study_session',
    `Studied ${subjectName}`,
    `Completed a ${minutes}-minute study session`,
    minutes,
    xpAmount,
    session.subjectId,
    { sessionId: session.id }
  );

  const updatedProfile = await getProfileById(userId);
  if (updatedProfile) {
    const newStreak = await computeCurrentStreak(userId);
    if (newStreak !== updatedProfile.streak) {
      await userProfileStorage.update({
        ...updatedProfile,
        streak: newStreak,
        updatedAt: new Date().toISOString(),
      });

      if (newStreak > 0 && newStreak % 7 === 0) {
        await createNotification(
          userId,
          'streak_milestone',
          'Streak Milestone!',
          `Amazing! You're on a ${newStreak}-day study streak!`,
          null
        );
        await generateActivity(
          userId,
          'streak_milestone',
          `${newStreak}-day streak!`,
          null,
          null,
          0,
          null,
          { streak: newStreak }
        );
      }
    }
  }

  void leveledUp;
}

async function computeCurrentStreak(userId: string): Promise<number> {
  const sessions = await studySessionStorage.getAll();
  const userSessions = sessions
    .filter((s) => s.startTime)
    .sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

  if (userSessions.length === 0) return 0;

  let streak = 0;
  let current = new Date();
  current.setHours(0, 0, 0, 0);

  for (const session of userSessions) {
    const d = new Date(session.startTime);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor(
      (current.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === streak) {
      streak++;
      current = d;
    } else if (diff > streak) {
      break;
    }
  }
  return streak;
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
