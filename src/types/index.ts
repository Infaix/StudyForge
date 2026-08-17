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
