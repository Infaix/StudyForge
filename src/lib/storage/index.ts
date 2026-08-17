import { Subject, Topic, Assessment, StudySession, StudyTask, Flashcard, FlashcardDeck, Quiz, QuizQuestion, QuizResult, UserSettings } from '@/types';

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
