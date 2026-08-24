import { getCloudflareContext } from '@opennextjs/cloudflare';

export function getDB() {
  const { env } = getCloudflareContext();
  const db = env.DATABASE;
  if (!db) throw new Error('DATABASE binding not found. Configure D1 in wrangler.jsonc.');
  return db;
}

export interface EntityConfig {
  table: string;
  columns: Record<string, string>;
  jsonFields?: string[];
  hasUserId?: boolean;
}

export const ENTITIES: Record<string, EntityConfig> = {
  subjects: {
    table: 'subjects',
    columns: { id: 'id', name: 'name', colour: 'colour', icon: 'icon', createdAt: 'created_at' },
    hasUserId: true,
  },
  topics: {
    table: 'topics',
    columns: { id: 'id', subjectId: 'subject_id', name: 'name', mastery: 'mastery', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
  assessments: {
    table: 'assessments',
    columns: { id: 'id', subjectId: 'subject_id', name: 'name', date: 'date', weighting: 'weighting', targetScore: 'target_score', actualScore: 'actual_score', status: 'status' },
    hasUserId: true,
  },
  'study-sessions': {
    table: 'study_sessions',
    columns: { id: 'id', subjectId: 'subject_id', topicId: 'topic_id', duration: 'duration', durationSeconds: 'duration_seconds', segmentId: 'segment_id', mode: 'mode', completed: 'completed', createdAt: 'created_at', startTime: 'start_time', endTime: 'end_time', notes: 'notes' },
    hasUserId: true,
  },
  'study-tasks': {
    table: 'study_tasks',
    columns: { id: 'id', subjectId: 'subject_id', topicId: 'topic_id', title: 'title', description: 'description', dueDate: 'due_date', completed: 'completed', priority: 'priority', createdAt: 'created_at', completedAt: 'completed_at' },
    hasUserId: true,
  },
  'flashcard-decks': {
    table: 'flashcard_decks',
    columns: { id: 'id', subjectId: 'subject_id', name: 'name', description: 'description', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
  flashcards: {
    table: 'flashcards',
    columns: { id: 'id', deckId: 'deck_id', front: 'front', back: 'back', difficulty: 'difficulty', nextReview: 'next_review', interval: 'interval', easeFactor: 'ease_factor', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
  quizzes: {
    table: 'quizzes',
    columns: { id: 'id', subjectId: 'subject_id', topicId: 'topic_id', name: 'name', description: 'description', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
  'quiz-questions': {
    table: 'quiz_questions',
    columns: { id: 'id', quizId: 'quiz_id', question: 'question', type: 'type', options: 'options', correctAnswer: 'correct_answer', explanation: 'explanation' },
    jsonFields: ['options', 'correctAnswer'],
    hasUserId: true,
  },
  'quiz-results': {
    table: 'quiz_results',
    columns: { id: 'id', quizId: 'quiz_id', score: 'score', totalQuestions: 'total_questions', completedAt: 'completed_at', answers: 'answers' },
    jsonFields: ['answers'],
    hasUserId: true,
  },
  'user-settings': {
    table: 'user_settings',
    columns: { id: 'id', theme: 'theme', studyGoalMinutes: 'study_goal_minutes', notificationEnabled: 'notification_enabled', studyReminders: 'study_reminders', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
  notes: {
    table: 'notes',
    columns: { id: 'id', title: 'title', content: 'content', subject: 'subject', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
  'friend-requests': {
    table: 'friend_requests',
    columns: { id: 'id', fromUserId: 'from_user_id', toUserId: 'to_user_id', message: 'message', createdAt: 'created_at', status: 'status' },
    hasUserId: false,
  },
  groups: {
    table: 'groups',
    columns: { id: 'id', name: 'name', description: 'description', icon: 'icon', subjectId: 'subject_id', administratorId: 'user_id', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
  'group-members': {
    table: 'group_members',
    columns: { id: 'id', groupId: 'group_id', userId: 'user_id', role: 'role', joinedAt: 'joined_at' },
    hasUserId: false,
  },
  'group-invites': {
    table: 'group_invites',
    columns: { id: 'id', groupId: 'group_id', invitedByUserId: 'invited_by_user_id', toUserId: 'to_user_id', status: 'status', createdAt: 'created_at' },
    hasUserId: false,
  },
  'study-activities': {
    table: 'study_activities',
    columns: { id: 'id', type: 'type', title: 'title', description: 'description', durationMinutes: 'duration_minutes', xpAwarded: 'xp_awarded', subjectId: 'subject_id', metadata: 'metadata', createdAt: 'created_at' },
    jsonFields: ['metadata'],
    hasUserId: true,
  },
  'xp-transactions': {
    table: 'xp_transactions',
    columns: { id: 'id', amount: 'amount', reason: 'reason', relatedId: 'related_id', createdAt: 'created_at' },
    hasUserId: true,
  },
  achievements: {
    table: 'achievements',
    columns: { id: 'id', title: 'title', description: 'description', icon: 'icon', category: 'category', requirement: 'requirement', rewardXp: 'reward_xp' },
    hasUserId: false,
  },
  'user-achievements': {
    table: 'user_achievements',
    columns: { id: 'id', achievementId: 'achievement_id', unlockedAt: 'unlocked_at' },
    hasUserId: true,
  },
  notifications: {
    table: 'notifications',
    columns: { id: 'id', type: 'type', title: 'title', message: 'message', read: 'read', relatedId: 'related_id', createdAt: 'created_at' },
    hasUserId: true,
  },
  'user-profiles': {
    table: 'user_profiles',
    columns: { id: 'user_id', displayName: 'display_name', avatarUrl: 'avatar_url', bio: 'bio', xp: 'xp', level: 'level', streak: 'streak', studyTimeToday: 'study_time_today', studyTimeThisWeek: 'study_time_this_week', studyTimeThisMonth: 'study_time_this_month', studyTimeAllTime: 'study_time_all_time', privacyProfilePublic: 'privacy_profile_public', privacyShowStats: 'privacy_show_stats', privacyShowActivity: 'privacy_show_activity', privacyShowLeaderboardStats: 'privacy_show_leaderboard_stats', privacyShowSubjects: 'privacy_show_subjects', createdAt: 'created_at', updatedAt: 'updated_at' },
    hasUserId: true,
  },
};

export function toSnakeCase(obj: Record<string, unknown>, columnMap: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const reverseMap = Object.entries(columnMap);
  for (const [camelKey, value] of Object.entries(obj)) {
    const snakeKey = reverseMap.find(([c]) => c === camelKey)?.[1];
    if (snakeKey) result[snakeKey] = value;
  }
  return result;
}

export function toCamelCase(row: Record<string, unknown>, columnMap: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [camelKey, snakeKey] of Object.entries(columnMap)) {
    if (snakeKey in row) result[camelKey] = row[snakeKey];
  }
  return result;
}

export function serializeJsonFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result = { ...obj };
  for (const field of fields) {
    if (field in result && result[field] !== null && typeof result[field] === 'object') {
      result[field] = JSON.stringify(result[field]);
    }
  }
  return result;
}

export function deserializeJsonFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result = { ...row };
  for (const field of fields) {
    if (field in result && typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field] as string); } catch { /* keep as-is */ }
    }
  }
  return result;
}

const FILTER_ALIASES: Record<string, string> = {
  subjectId: 'subject_id',
  deckId: 'deck_id',
  quizId: 'quiz_id',
  groupId: 'group_id',
  fromUserId: 'from_user_id',
  toUserId: 'to_user_id',
};

export { FILTER_ALIASES };
