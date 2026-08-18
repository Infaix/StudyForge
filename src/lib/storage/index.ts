import { Subject, Topic, Assessment, StudySession, StudyTask, Flashcard, FlashcardDeck, Quiz, QuizQuestion, QuizResult, UserSettings, UserProfile, AuthUser, FriendRequest, Group, GroupMember, GroupInvite, StudyActivity, XpTransaction, Achievement, UserAchievement, Notification } from '@/types';

const DB_NAME = 'StudyForgeDB';
const DB_VERSION = 1;

interface StoreConfig {
  name: string;
  keyPath: string;
  indexes?: { name: string; keyPath: string; options?: IDBIndexParameters }[];
}

const STORES: StoreConfig[] = [
  { name: 'subjects', keyPath: 'id' },
  { name: 'topics', keyPath: 'id', indexes: [{ name: 'subjectId', keyPath: 'subjectId' }] },
  { name: 'assessments', keyPath: 'id', indexes: [{ name: 'subjectId', keyPath: 'subjectId' }] },
  { name: 'studySessions', keyPath: 'id', indexes: [{ name: 'subjectId', keyPath: 'subjectId' }] },
  { name: 'studyTasks', keyPath: 'id', indexes: [{ name: 'subjectId', keyPath: 'subjectId' }] },
  { name: 'flashcards', keyPath: 'id', indexes: [{ name: 'deckId', keyPath: 'deckId' }] },
  { name: 'flashcardDecks', keyPath: 'id', indexes: [{ name: 'subjectId', keyPath: 'subjectId' }] },
  { name: 'quizzes', keyPath: 'id', indexes: [{ name: 'subjectId', keyPath: 'subjectId' }] },
  { name: 'quizQuestions', keyPath: 'id', indexes: [{ name: 'quizId', keyPath: 'quizId' }] },
  { name: 'quizResults', keyPath: 'id', indexes: [{ name: 'quizId', keyPath: 'quizId' }] },
  { name: 'userSettings', keyPath: 'id' },
  { name: 'userProfiles', keyPath: 'id', indexes: [{ name: 'username', keyPath: 'username' }] },
  { name: 'friendRequests', keyPath: 'id', indexes: [{ name: 'fromUserId', keyPath: 'fromUserId' }, { name: 'toUserId', keyPath: 'toUserId' }] },
  { name: 'groups', keyPath: 'id', indexes: [{ name: 'administratorId', keyPath: 'administratorId' }] },
  { name: 'groupMembers', keyPath: 'id', indexes: [{ name: 'groupId', keyPath: 'groupId' }, { name: 'userId', keyPath: 'userId' }] },
  { name: 'groupInvites', keyPath: 'id', indexes: [{ name: 'groupId', keyPath: 'groupId' }, { name: 'toUserId', keyPath: 'toUserId' }] },
  { name: 'studyActivities', keyPath: 'id' },
  { name: 'xpTransactions', keyPath: 'id' },
  { name: 'achievements', keyPath: 'id' },
  { name: 'userAchievements', keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }, { name: 'achievementId', keyPath: 'achievementId' }] },
  { name: 'notifications', keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }] },
];

let db: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      STORES.forEach((store) => {
        if (!database.objectStoreNames.contains(store.name)) {
          const objectStore = database.createObjectStore(store.name, { keyPath: store.keyPath });
          store.indexes?.forEach((index) => {
            objectStore.createIndex(index.name, index.keyPath, index.options);
          });
        }
      });
    };
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function get<T>(storeName: string, id: string): Promise<T | null> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as T || null);
    request.onerror = () => reject(request.error);
  });
}

async function add<T>(storeName: string, item: T): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.add(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(storeName: string, item: T): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function remove(storeName: string, id: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getByIndex<T>(storeName: string, indexName: string, value: string): Promise<T[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export const subjectStorage = {
  getAll: () => getAll<Subject>('subjects'),
  get: (id: string) => get<Subject>('subjects', id),
  create: (subject: Subject) => add('subjects', subject),
  update: (subject: Subject) => put('subjects', subject),
  delete: (id: string) => remove('subjects', id),
};

export const topicStorage = {
  getAll: () => getAll<Topic>('topics'),
  get: (id: string) => get<Topic>('topics', id),
  getBySubject: (subjectId: string) => getByIndex<Topic>('topics', 'subjectId', subjectId),
  create: (topic: Topic) => add('topics', topic),
  update: (topic: Topic) => put('topics', topic),
  delete: (id: string) => remove('topics', id),
};

export const assessmentStorage = {
  getAll: () => getAll<Assessment>('assessments'),
  get: (id: string) => get<Assessment>('assessments', id),
  getBySubject: (subjectId: string) => getByIndex<Assessment>('assessments', 'subjectId', subjectId),
  create: (assessment: Assessment) => add('assessments', assessment),
  update: (assessment: Assessment) => put('assessments', assessment),
  delete: (id: string) => remove('assessments', id),
};

export const studySessionStorage = {
  getAll: () => getAll<StudySession>('studySessions'),
  get: (id: string) => get<StudySession>('studySessions', id),
  getBySubject: (subjectId: string) => getByIndex<StudySession>('studySessions', 'subjectId', subjectId),
  create: (session: StudySession) => add('studySessions', session),
  update: (session: StudySession) => put('studySessions', session),
  delete: (id: string) => remove('studySessions', id),
};

export const studyTaskStorage = {
  getAll: () => getAll<StudyTask>('studyTasks'),
  get: (id: string) => get<StudyTask>('studyTasks', id),
  getBySubject: (subjectId: string) => getByIndex<StudyTask>('studyTasks', 'subjectId', subjectId),
  create: (task: StudyTask) => add('studyTasks', task),
  update: (task: StudyTask) => put('studyTasks', task),
  delete: (id: string) => remove('studyTasks', id),
};

export const flashcardStorage = {
  getAll: () => getAll<Flashcard>('flashcards'),
  get: (id: string) => get<Flashcard>('flashcards', id),
  getByDeck: (deckId: string) => getByIndex<Flashcard>('flashcards', 'deckId', deckId),
  create: (card: Flashcard) => add('flashcards', card),
  update: (card: Flashcard) => put('flashcards', card),
  delete: (id: string) => remove('flashcards', id),
};

export const flashcardDeckStorage = {
  getAll: () => getAll<FlashcardDeck>('flashcardDecks'),
  get: (id: string) => get<FlashcardDeck>('flashcardDecks', id),
  getBySubject: (subjectId: string) => getByIndex<FlashcardDeck>('flashcardDecks', 'subjectId', subjectId),
  create: (deck: FlashcardDeck) => add('flashcardDecks', deck),
  update: (deck: FlashcardDeck) => put('flashcardDecks', deck),
  delete: (id: string) => remove('flashcardDecks', id),
};

export const quizStorage = {
  getAll: () => getAll<Quiz>('quizzes'),
  get: (id: string) => get<Quiz>('quizzes', id),
  getBySubject: (subjectId: string) => getByIndex<Quiz>('quizzes', 'subjectId', subjectId),
  create: (quiz: Quiz) => add('quizzes', quiz),
  update: (quiz: Quiz) => put('quizzes', quiz),
  delete: (id: string) => remove('quizzes', id),
};

export const quizQuestionStorage = {
  getAll: () => getAll<QuizQuestion>('quizQuestions'),
  get: (id: string) => get<QuizQuestion>('quizQuestions', id),
  getByQuiz: (quizId: string) => getByIndex<QuizQuestion>('quizQuestions', 'quizId', quizId),
  create: (question: QuizQuestion) => add('quizQuestions', question),
  update: (question: QuizQuestion) => put('quizQuestions', question),
  delete: (id: string) => remove('quizQuestions', id),
};

export const quizResultStorage = {
  getAll: () => getAll<QuizResult>('quizResults'),
  get: (id: string) => get<QuizResult>('quizResults', id),
  getByQuiz: (quizId: string) => getByIndex<QuizResult>('quizResults', 'quizId', quizId),
  create: (result: QuizResult) => add('quizResults', result),
  update: (result: QuizResult) => put('quizResults', result),
  delete: (id: string) => remove('quizResults', id),
};

export const userSettingsStorage = {
  get: (id: string = 'default') => get<UserSettings>('userSettings', id),
  create: (settings: UserSettings) => add('userSettings', settings),
  update: (settings: UserSettings) => put('userSettings', settings),
};

export const userProfileStorage = {
  getAll: () => getAll<UserProfile>('userProfiles'),
  get: (id: string = 'default') => get<UserProfile>('userProfiles', id),
  getByUsername: (username: string) => {
    return getByIndex<UserProfile>('userProfiles', 'username', username).then((results) => results[0] ?? null);
  },
  create: (profile: UserProfile) => add('userProfiles', profile),
  update: (profile: UserProfile) => put('userProfiles', profile),
  delete: (id: string) => remove('userProfiles', id),
};

export const friendRequestStorage = {
  getAllByUser: (userId: string) => getByIndex<FriendRequest>('friendRequests', 'toUserId', userId),
  getAllSentByUser: (userId: string) => getByIndex<FriendRequest>('friendRequests', 'fromUserId', userId),
  get: (id: string) => get<FriendRequest>('friendRequests', id),
  create: (request: FriendRequest) => add('friendRequests', request),
  update: (request: FriendRequest) => put('friendRequests', request),
  delete: (id: string) => remove('friendRequests', id),
};

export const groupStorage = {
  getAllByAdministrator: (adminId: string) => getByIndex<Group>('groups', 'administratorId', adminId),
  get: (id: string) => get<Group>('groups', id),
  create: (group: Group) => add('groups', group),
  update: (group: Group) => put('groups', group),
  delete: (id: string) => remove('groups', id),
};

export const groupMemberStorage = {
  getAllByGroup: (groupId: string) => getByIndex<GroupMember>('groupMembers', 'groupId', groupId),
  getAllByUser: (userId: string) => getByIndex<GroupMember>('groupMembers', 'userId', userId),
  get: (id: string) => get<GroupMember>('groupMembers', id),
  create: (member: GroupMember) => add('groupMembers', member),
  update: (member: GroupMember) => put('groupMembers', member),
  delete: (id: string) => remove('groupMembers', id),
};

export const groupInviteStorage = {
  getAllByGroup: (groupId: string) => getByIndex<GroupInvite>('groupInvites', 'groupId', groupId),
  getAllPendingByUser: (userId: string) => getByIndex<GroupInvite>('groupInvites', 'toUserId', userId),
  get: (id: string) => get<GroupInvite>('groupInvites', id),
  create: (invite: GroupInvite) => add('groupInvites', invite),
  update: (invite: GroupInvite) => put('groupInvites', invite),
  delete: (id: string) => remove('groupInvites', id),
};

export const studyActivityStorage = {
  create: (activity: StudyActivity) => add('studyActivities', activity),
  getAllByUser: (userId: string) => getByIndex<StudyActivity>('studyActivities', 'userId', userId),
  get: (id: string) => get<StudyActivity>('studyActivities', id),
};

export const xpTransactionStorage = {
  getAll: () => getAll<XpTransaction>('xpTransactions'),
  create: (transaction: XpTransaction) => add('xpTransactions', transaction),
  getAllByUser: (userId: string) => getByIndex<XpTransaction>('xpTransactions', 'userId', userId),
  get: (id: string) => get<XpTransaction>('xpTransactions', id),
};

export const achievementStorage = {
  getAll: () => getAll<Achievement>('achievements'),
  get: (id: string) => get<Achievement>('achievements', id),
};

export const userAchievementStorage = {
  getAllByUser: (userId: string) => getByIndex<UserAchievement>('userAchievements', 'userId', userId),
  get: (id: string) => get<UserAchievement>('userAchievements', id),
  create: (ua: UserAchievement) => add('userAchievements', ua),
};

export const notificationStorage = {
  create: (notification: Notification) => add('notifications', notification),
  getAllByUser: (userId: string) => getByIndex<Notification>('notifications', 'userId', userId),
  get: (id: string) => get<Notification>('notifications', id),
  markRead: async (id: string) => {
    const notification = await get<Notification>('notifications', id);
    return put('notifications', { ...notification, read: true });
  },
  markAllRead: async (userId: string) => {
    const notifications = await getByIndex<Notification>('notifications', 'userId', userId);
    notifications.forEach((n) => put('notifications', { ...n, read: true }));
  },
};
