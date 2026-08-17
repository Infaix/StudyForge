import { describe, it, expect } from 'vitest';
import { gradeQuiz, getQuizStats } from '../quiz-engine';
import { QuizQuestion, QuizResult } from '@/types';

function makeQuestion(overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: 'q1',
    quizId: 'quiz-1',
    question: 'What is 2+2?',
    type: 'multiple-choice',
    options: ['3', '4', '5', '6'],
    correctAnswer: 1,
    explanation: 'Basic math',
    ...overrides,
  };
}

function makeResult(overrides: Partial<QuizResult> = {}): QuizResult {
  return {
    id: 'r1',
    quizId: 'quiz-1',
    score: 8,
    totalQuestions: 10,
    completedAt: new Date().toISOString(),
    answers: [],
    ...overrides,
  };
}

describe('gradeQuiz', () => {
  it('grades multiple-choice correctly', () => {
    const questions = [
      makeQuestion({ id: 'q1', type: 'multiple-choice', correctAnswer: 1 }),
      makeQuestion({ id: 'q2', type: 'multiple-choice', correctAnswer: 0 }),
    ];
    const answers = [1, 0];
    const result = gradeQuiz(questions, answers);
    expect(result.score).toBe(2);
    expect(result.totalQuestions).toBe(2);
    expect(result.results.every(r => r.correct)).toBe(true);
  });

  it('grades incorrect answers', () => {
    const questions = [
      makeQuestion({ id: 'q1', type: 'multiple-choice', correctAnswer: 1 }),
    ];
    const answers = [0];
    const result = gradeQuiz(questions, answers);
    expect(result.score).toBe(0);
    expect(result.results[0].correct).toBe(false);
  });

  it('grades true-false correctly', () => {
    const questions = [
      makeQuestion({
        id: 'q1',
        type: 'true-false',
        options: ['True', 'False'],
        correctAnswer: 0,
      }),
    ];
    const answers = [0];
    const result = gradeQuiz(questions, answers);
    expect(result.score).toBe(1);
  });

  it('grades short-answer case-insensitively', () => {
    const questions = [
      makeQuestion({
        id: 'q1',
        type: 'short-answer',
        options: [],
        correctAnswer: 'photosynthesis',
      }),
    ];
    const answers = ['Photosynthesis'];
    const result = gradeQuiz(questions, answers);
    expect(result.score).toBe(1);
  });

  it('grades short-answer with whitespace', () => {
    const questions = [
      makeQuestion({
        id: 'q1',
        type: 'short-answer',
        options: [],
        correctAnswer: 'answer',
      }),
    ];
    const answers = ['  answer  '];
    const result = gradeQuiz(questions, answers);
    expect(result.score).toBe(1);
  });

  it('handles unanswered questions as incorrect', () => {
    const questions = [
      makeQuestion({ id: 'q1', type: 'multiple-choice', correctAnswer: 1 }),
      makeQuestion({ id: 'q2', type: 'multiple-choice', correctAnswer: 0 }),
    ];
    const answers: (number | string)[] = [];
    const result = gradeQuiz(questions, answers);
    expect(result.score).toBe(0);
    expect(result.totalQuestions).toBe(2);
  });

  it('handles empty questions array', () => {
    const result = gradeQuiz([], []);
    expect(result.score).toBe(0);
    expect(result.totalQuestions).toBe(0);
  });
});

describe('getQuizStats', () => {
  it('calculates average correctly', () => {
    const results = [
      makeResult({ score: 8, totalQuestions: 10 }),
      makeResult({ id: 'r2', score: 6, totalQuestions: 10 }),
    ];
    const stats = getQuizStats(results);
    expect(stats.averageScore).toBe(70);
    expect(stats.totalQuizzes).toBe(2);
  });

  it('finds best score', () => {
    const results = [
      makeResult({ score: 7, totalQuestions: 10 }),
      makeResult({ id: 'r2', score: 9, totalQuestions: 10 }),
    ];
    const stats = getQuizStats(results);
    expect(stats.bestScore).toBe(90);
  });

  it('handles empty results', () => {
    const stats = getQuizStats([]);
    expect(stats.averageScore).toBe(0);
    expect(stats.totalQuizzes).toBe(0);
    expect(stats.bestScore).toBe(0);
  });

  it('detects improving trend', () => {
    const now = new Date();
    const results = [
      makeResult({ score: 5, totalQuestions: 10, completedAt: new Date(now.getTime() - 100000).toISOString() }),
      makeResult({ id: 'r2', score: 5, totalQuestions: 10, completedAt: new Date(now.getTime() - 50000).toISOString() }),
      makeResult({ id: 'r3', score: 9, totalQuestions: 10, completedAt: now.toISOString() }),
    ];
    const stats = getQuizStats(results);
    expect(stats.recentTrend).toBe('improving');
  });
});
