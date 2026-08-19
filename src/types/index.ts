export interface Subject {
  id: string;
  name: string;
  colour: string;
  icon: string;
  createdAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  mastery: number;
  createdAt: string;
  updatedAt: string;
}

export interface Assessment {
  id: string;
  subjectId: string;
  name: string;
  date: string;
  weighting: number;
  targetScore: number;
  actualScore: number | null;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export interface StudySession {
  id: string;
  subjectId: string;
  topicId: string | null;
  duration: number;
  startTime: string;
  endTime: string;
  notes: string | null;
}

export interface StudyTask {
  id: string;
  subjectId: string;
  topicId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  completedAt: string | null;
}

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  difficulty: number;
  nextReview: string;
  interval: number;
  easeFactor: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardDeck {
  id: string;
  subjectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Quiz {
  id: string;
  subjectId: string;
  topicId: string | null;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  question: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer';
  options: string[];
  correctAnswer: number | string;
  explanation: string | null;
}

export interface QuizResult {
  id: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  completedAt: string;
  answers: (number | string)[];
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  studyGoalMinutes: number;
  notificationEnabled: boolean;
  studyReminders: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrivacySettings {
  profilePublic: boolean;
  showStats: boolean;
  showActivity: boolean;
  showLeaderboardStats: boolean;
  showSubjects: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  profilePublic: true,
  showStats: true,
  showActivity: true,
  showLeaderboardStats: true,
  showSubjects: true,
};

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  xp: number;
  level: number;
  streak: number;
  studyTimeToday: number;
  studyTimeThisWeek: number;
  studyTimeThisMonth: number;
  studyTimeAllTime: number;
  friends: string[];
  friendRequestsReceived: string[];
  friendRequestsSent: string[];
  groups: string[];
  achievements: string[];
  privacy: PrivacySettings;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  xp: number;
  level: number;
  streak: number;
  studyTimeToday: number;
  studyTimeThisWeek: number;
  studyTimeThisMonth: number;
  studyTimeAllTime: number;
  friends: string[];
  friendRequestsReceived: string[];
  friendRequestsSent: string[];
  groups: string[];
  achievements: string[];
  privacy: PrivacySettings;
  createdAt: string;
  updatedAt: string;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string | null;
  createdAt: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  subjectId: string | null;
  administratorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: 'administrator' | 'member';
  joinedAt: string;
}

export interface GroupInvite {
  id: string;
  groupId: string;
  invitedByUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface StudyActivity {
  id: string;
  userId: string;
  type: 'study_session' | 'stopwatch_session' | 'quiz' | 'flashcard' | 'achievement' | 'level_up' | 'streak_milestone';
  title: string;
  description: string | null;
  durationMinutes: number | null;
  xpAwarded: number;
  subjectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface XpTransaction {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  relatedId: string | null; // e.g., session ID, quiz ID
  createdAt: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement: string;
  rewardXp: number;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  unlockedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'friend_request' | 'friend_request_accepted' | 'group_invitation' | 'achievement_unlocked' | 'level_up' | 'leaderboard_change' | 'streak_milestone';
  title: string;
  message: string;
  read: boolean;
  relatedId: string | null;
  createdAt: string;
}
