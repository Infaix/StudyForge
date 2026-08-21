import { Subject, Topic, Assessment, StudySession, StudyTask, Flashcard, FlashcardDeck, Quiz, QuizQuestion, QuizResult, UserSettings, UserProfile, AuthUser, FriendRequest, Group, GroupMember, GroupInvite, StudyActivity, XpTransaction, Achievement, UserAchievement, Notification } from '@/types';

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`API GET ${url} failed: ${res.status}`);
  return res.json();
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API POST ${url} failed: ${res.status}`);
  return res.json();
}

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API PUT ${url} failed: ${res.status}`);
  return res.json();
}

async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`API DELETE ${url} failed: ${res.status}`);
}

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v);
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

export const subjectStorage = {
  getAll: () => apiGet<Subject[]>('/api/data/subjects'),
  get: (id: string) => apiGet<Subject>(`/api/data/subjects/${id}`),
  create: (subject: Subject) => apiPost('/api/data/subjects', subject),
  update: (subject: Subject) => apiPut(`/api/data/subjects/${subject.id}`, subject),
  delete: (id: string) => apiDelete(`/api/data/subjects/${id}`),
};

export const topicStorage = {
  getAll: () => apiGet<Topic[]>('/api/data/topics'),
  get: (id: string) => apiGet<Topic>(`/api/data/topics/${id}`),
  getBySubject: (subjectId: string) => apiGet<Topic[]>(`/api/data/topics${qs({ subjectId })}`),
  create: (topic: Topic) => apiPost('/api/data/topics', topic),
  update: (topic: Topic) => apiPut(`/api/data/topics/${topic.id}`, topic),
  delete: (id: string) => apiDelete(`/api/data/topics/${id}`),
};

export const assessmentStorage = {
  getAll: () => apiGet<Assessment[]>('/api/data/assessments'),
  get: (id: string) => apiGet<Assessment>(`/api/data/assessments/${id}`),
  getBySubject: (subjectId: string) => apiGet<Assessment[]>(`/api/data/assessments${qs({ subjectId })}`),
  create: (assessment: Assessment) => apiPost('/api/data/assessments', assessment),
  update: (assessment: Assessment) => apiPut(`/api/data/assessments/${assessment.id}`, assessment),
  delete: (id: string) => apiDelete(`/api/data/assessments/${id}`),
};

export const studySessionStorage = {
  getAll: () => apiGet<StudySession[]>('/api/data/study-sessions'),
  get: (id: string) => apiGet<StudySession>(`/api/data/study-sessions/${id}`),
  getBySubject: (subjectId: string) => apiGet<StudySession[]>(`/api/data/study-sessions${qs({ subjectId })}`),
  create: (session: StudySession) => apiPost('/api/data/study-sessions', session),
  update: (session: StudySession) => apiPut(`/api/data/study-sessions/${session.id}`, session),
  delete: (id: string) => apiDelete(`/api/data/study-sessions/${id}`),
  complete: (session: StudySession, subjectName?: string) =>
    apiPost('/api/study/sessions/complete', { duration: session.duration, subjectId: session.subjectId ?? null, sessionId: session.id, notes: session.notes, startTime: session.startTime }),
};

export const studyTaskStorage = {
  getAll: () => apiGet<StudyTask[]>('/api/data/study-tasks'),
  get: (id: string) => apiGet<StudyTask>(`/api/data/study-tasks/${id}`),
  getBySubject: (subjectId: string) => apiGet<StudyTask[]>(`/api/data/study-tasks${qs({ subjectId })}`),
  create: (task: StudyTask) => apiPost('/api/data/study-tasks', task),
  update: (task: StudyTask) => apiPut(`/api/data/study-tasks/${task.id}`, task),
  delete: (id: string) => apiDelete(`/api/data/study-tasks/${id}`),
};

export const flashcardStorage = {
  getAll: () => apiGet<Flashcard[]>('/api/data/flashcards'),
  get: (id: string) => apiGet<Flashcard>(`/api/data/flashcards/${id}`),
  getByDeck: (deckId: string) => apiGet<Flashcard[]>(`/api/data/flashcards${qs({ deckId })}`),
  create: (card: Flashcard) => apiPost('/api/data/flashcards', card),
  update: (card: Flashcard) => apiPut(`/api/data/flashcards/${card.id}`, card),
  delete: (id: string) => apiDelete(`/api/data/flashcards/${id}`),
};

export const flashcardDeckStorage = {
  getAll: () => apiGet<FlashcardDeck[]>('/api/data/flashcard-decks'),
  get: (id: string) => apiGet<FlashcardDeck>(`/api/data/flashcard-decks/${id}`),
  getBySubject: (subjectId: string) => apiGet<FlashcardDeck[]>(`/api/data/flashcard-decks${qs({ subjectId })}`),
  create: (deck: FlashcardDeck) => apiPost('/api/data/flashcard-decks', deck),
  update: (deck: FlashcardDeck) => apiPut(`/api/data/flashcard-decks/${deck.id}`, deck),
  delete: (id: string) => apiDelete(`/api/data/flashcard-decks/${id}`),
};

export const quizStorage = {
  getAll: () => apiGet<Quiz[]>('/api/data/quizzes'),
  get: (id: string) => apiGet<Quiz>(`/api/data/quizzes/${id}`),
  getBySubject: (subjectId: string) => apiGet<Quiz[]>(`/api/data/quizzes${qs({ subjectId })}`),
  create: (quiz: Quiz) => apiPost('/api/data/quizzes', quiz),
  update: (quiz: Quiz) => apiPut(`/api/data/quizzes/${quiz.id}`, quiz),
  delete: (id: string) => apiDelete(`/api/data/quizzes/${id}`),
};

export const quizQuestionStorage = {
  getAll: () => apiGet<QuizQuestion[]>('/api/data/quiz-questions'),
  get: (id: string) => apiGet<QuizQuestion>(`/api/data/quiz-questions/${id}`),
  getByQuiz: (quizId: string) => apiGet<QuizQuestion[]>(`/api/data/quiz-questions${qs({ quizId })}`),
  create: (question: QuizQuestion) => apiPost('/api/data/quiz-questions', question),
  update: (question: QuizQuestion) => apiPut(`/api/data/quiz-questions/${question.id}`, question),
  delete: (id: string) => apiDelete(`/api/data/quiz-questions/${id}`),
};

export const quizResultStorage = {
  getAll: () => apiGet<QuizResult[]>('/api/data/quiz-results'),
  get: (id: string) => apiGet<QuizResult>(`/api/data/quiz-results/${id}`),
  getByQuiz: (quizId: string) => apiGet<QuizResult[]>(`/api/data/quiz-results${qs({ quizId })}`),
  create: (result: QuizResult) => apiPost('/api/data/quiz-results', result),
  update: (result: QuizResult) => apiPut(`/api/data/quiz-results/${result.id}`, result),
  delete: (id: string) => apiDelete(`/api/data/quiz-results/${id}`),
};

export const userSettingsStorage = {
  get: (_id: string = 'default') => apiGet<UserSettings>('/api/data/user-settings'),
  create: (settings: UserSettings) => apiPost('/api/data/user-settings', settings),
  update: (settings: UserSettings) => apiPut('/api/data/user-settings/default', settings),
};

export const userProfileStorage = {
  getAll: () => apiGet<UserProfile[]>('/api/data/user-profiles'),
  get: (id: string = 'default') => {
    if (id === 'current-user') {
      return apiGet<{ user: AuthUser }>('/api/auth/me').then((r) => r.user as unknown as UserProfile);
    }
    return apiGet<UserProfile>(`/api/data/user-profiles/${id}`);
  },
  getByUsername: (username: string) =>
    apiGet<{ user: UserProfile }>(`/api/social/profile/${encodeURIComponent(username)}`).then((r) => r.user ?? null),
  create: (profile: UserProfile) => apiPost('/api/data/user-profiles', profile),
  update: (profile: UserProfile) => apiPut(`/api/data/user-profiles/${profile.id}`, profile),
  delete: (id: string) => apiDelete(`/api/data/user-profiles/${id}`),
};

export const friendRequestStorage = {
  getAllByUser: (userId: string) => apiGet<FriendRequest[]>(`/api/data/friend-requests${qs({ toUserId: userId })}`),
  getAllSentByUser: (userId: string) => apiGet<FriendRequest[]>(`/api/data/friend-requests${qs({ fromUserId: userId })}`),
  get: (id: string) => apiGet<FriendRequest>(`/api/data/friend-requests/${id}`),
  create: (request: FriendRequest) => apiPost('/api/data/friend-requests', request),
  update: (request: FriendRequest) => apiPut(`/api/data/friend-requests/${request.id}`, request),
  delete: (id: string) => apiDelete(`/api/data/friend-requests/${id}`),
};

export const groupStorage = {
  getAllByAdministrator: (adminId: string) => apiGet<Group[]>(`/api/data/groups${qs({ administratorId: adminId })}`),
  get: (id: string) => apiGet<Group>(`/api/data/groups/${id}`),
  create: (group: Group) => apiPost('/api/data/groups', group),
  update: (group: Group) => apiPut(`/api/data/groups/${group.id}`, group),
  delete: (id: string) => apiDelete(`/api/data/groups/${id}`),
};

export const groupMemberStorage = {
  getAllByGroup: (groupId: string) => apiGet<GroupMember[]>(`/api/data/group-members${qs({ groupId })}`),
  getAllByUser: (userId: string) => apiGet<GroupMember[]>(`/api/data/group-members${qs({ userId })}`),
  get: (id: string) => apiGet<GroupMember>(`/api/data/group-members/${id}`),
  create: (member: GroupMember) => apiPost('/api/data/group-members', member),
  update: (member: GroupMember) => apiPut(`/api/data/group-members/${member.id}`, member),
  delete: (id: string) => apiDelete(`/api/data/group-members/${id}`),
};

export const groupInviteStorage = {
  getAllByGroup: (groupId: string) => apiGet<GroupInvite[]>(`/api/data/group-invites${qs({ groupId })}`),
  getAllPendingByUser: (userId: string) => apiGet<GroupInvite[]>(`/api/data/group-invites${qs({ toUserId: userId })}`),
  get: (id: string) => apiGet<GroupInvite>(`/api/data/group-invites/${id}`),
  create: (invite: GroupInvite) => apiPost('/api/data/group-invites', invite),
  update: (invite: GroupInvite) => apiPut(`/api/data/group-invites/${invite.id}`, invite),
  delete: (id: string) => apiDelete(`/api/data/group-invites/${id}`),
};

export const studyActivityStorage = {
  create: (activity: StudyActivity) => apiPost('/api/data/study-activities', activity),
  getAllByUser: (userId: string) => apiGet<StudyActivity[]>(`/api/data/study-activities${qs({ userId })}`),
  get: (id: string) => apiGet<StudyActivity>(`/api/data/study-activities/${id}`),
};

export const xpTransactionStorage = {
  getAll: () => apiGet<XpTransaction[]>('/api/data/xp-transactions'),
  create: (transaction: XpTransaction) => apiPost('/api/data/xp-transactions', transaction),
  getAllByUser: (userId: string) => apiGet<XpTransaction[]>(`/api/data/xp-transactions${qs({ userId })}`),
  get: (id: string) => apiGet<XpTransaction>(`/api/data/xp-transactions/${id}`),
};

export const achievementStorage = {
  getAll: () => apiGet<Achievement[]>('/api/data/achievements'),
  get: (id: string) => apiGet<Achievement>(`/api/data/achievements/${id}`),
};

export const userAchievementStorage = {
  getAllByUser: (userId: string) => apiGet<UserAchievement[]>(`/api/data/user-achievements${qs({ userId })}`),
  get: (id: string) => apiGet<UserAchievement>(`/api/data/user-achievements/${id}`),
  create: (ua: UserAchievement) => apiPost('/api/data/user-achievements', ua),
};

export const notificationStorage = {
  create: (notification: Notification) => apiPost('/api/social/notifications', notification),
  getAllByUser: (_userId: string) => apiGet<Notification[]>('/api/social/notifications'),
  get: (id: string) => apiGet<Notification>(`/api/data/notifications/${id}`),
  markRead: (id: string) => apiPut('/api/social/notifications', { notificationId: id, action: 'markRead' }),
  markAllRead: (_userId: string) => apiPut('/api/social/notifications', { action: 'markAllRead' }),
};

export { apiGet, apiPost, apiPut, apiDelete };
