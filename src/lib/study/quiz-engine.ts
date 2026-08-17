import { QuizQuestion, QuizResult } from '@/types';

interface GradeResult {
  question: QuizQuestion;
  userAnswer: number | string;
  correct: boolean;
}

interface GradeQuizOutput {
  score: number;
  totalQuestions: number;
  results: GradeResult[];
}

interface QuizStats {
  averageScore: number;
  totalQuizzes: number;
  bestScore: number;
  recentTrend: 'improving' | 'declining' | 'stable';
}

function isAnswerCorrect(question: QuizQuestion, userAnswer: number | string): boolean {
  switch (question.type) {
    case 'multiple-choice':
      return userAnswer === question.correctAnswer;
    case 'true-false': {
      const correctIndex = question.correctAnswer as number;
      return userAnswer === correctIndex;
    }
    case 'short-answer': {
      const correct = (question.correctAnswer as string).trim().toLowerCase();
      const user = (userAnswer as string).trim().toLowerCase();
      return correct === user;
    }
    default:
      return false;
  }
}

export function gradeQuiz(
  questions: QuizQuestion[],
  answers: (number | string)[]
): GradeQuizOutput {
  const results: GradeResult[] = questions.map((question, index) => {
    const userAnswer = index < answers.length ? answers[index] : '';
    const correct = isAnswerCorrect(question, userAnswer);
    return { question, userAnswer, correct };
  });

  const score = results.filter((r) => r.correct).length;

  return {
    score,
    totalQuestions: questions.length,
    results,
  };
}

export function getQuizStats(results: QuizResult[]): QuizStats {
  if (results.length === 0) {
    return { averageScore: 0, totalQuizzes: 0, bestScore: 0, recentTrend: 'stable' };
  }

  const percentages = results.map(
    (r) => (r.totalQuestions > 0 ? (r.score / r.totalQuestions) * 100 : 0)
  );

  const totalQuizzes = results.length;
  const averageScore =
    percentages.reduce((sum, p) => sum + p, 0) / totalQuizzes;
  const bestScore = Math.max(...percentages);

  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (results.length >= 2) {
    const sorted = [...results].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    );
    const half = Math.ceil(sorted.length / 2);
    const olderHalf = sorted.slice(0, half);
    const newerHalf = sorted.slice(half);

    const olderAvg =
      olderHalf.reduce(
        (sum, r) => sum + (r.totalQuestions > 0 ? r.score / r.totalQuestions : 0),
        0
      ) / olderHalf.length;
    const newerAvg =
      newerHalf.reduce(
        (sum, r) => sum + (r.totalQuestions > 0 ? r.score / r.totalQuestions : 0),
        0
      ) / newerHalf.length;

    const diff = newerAvg - olderAvg;
    if (diff > 0.05) recentTrend = 'improving';
    else if (diff < -0.05) recentTrend = 'declining';
  }

  return {
    averageScore: Math.round(averageScore * 10) / 10,
    totalQuizzes,
    bestScore: Math.round(bestScore * 10) / 10,
    recentTrend,
  };
}
