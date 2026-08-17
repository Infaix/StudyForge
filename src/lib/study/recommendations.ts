import { Subject, Topic, Assessment, StudySession, Flashcard, QuizResult } from '@/types';

export interface StudyRecommendation {
  subjectId: string;
  subjectName: string;
  subjectIcon: string;
  subjectColour: string;
  topicId: string | null;
  topicName: string | null;
  reasons: string[];
  priority: 'high' | 'medium' | 'low';
  score: number;
  suggestedMinutes: number;
}

export interface RecommendationInput {
  subjects: Subject[];
  topics: Topic[];
  assessments: Assessment[];
  studySessions: StudySession[];
  flashcards?: Flashcard[];
  quizResults?: QuizResult[];
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function daysSince(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const past = new Date(dateStr);
  past.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
}

function getLastSessionForTopic(sessions: StudySession[], topicId: string): StudySession | null {
  const topicSessions = sessions.filter(s => s.topicId === topicId);
  if (topicSessions.length === 0) return null;
  return topicSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
}

function calculateTopicScore(
  topic: Topic,
  subject: Subject,
  assessments: Assessment[],
  sessions: StudySession[],
  flashcards?: Flashcard[],
  quizResults?: QuizResult[],
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const upcomingAssessments = assessments.filter(
    a => a.subjectId === subject.id && a.status === 'upcoming'
  );

  for (const assessment of upcomingAssessments) {
    const days = daysUntil(assessment.date);
    if (days >= 0 && days <= 14) {
      const urgency = Math.max(0, (14 - days) / 14) * 40;
      score += urgency * (assessment.weighting / 100);
      if (days <= 3) {
        reasons.push(`Assessment "${assessment.name}" in ${days} day${days !== 1 ? 's' : ''}`);
      } else if (days <= 7) {
        reasons.push(`Assessment "${assessment.name}" in ${days} days`);
      } else {
        reasons.push(`Assessment "${assessment.name}" coming up`);
      }
    }
  }

  const weakness = (100 - topic.mastery) / 100;
  score += weakness * 25;
  if (topic.mastery < 30) {
    reasons.push(`Mastery is low (${topic.mastery}%)`);
  } else if (topic.mastery < 60) {
    reasons.push(`Mastery needs improvement (${topic.mastery}%)`);
  } else if (topic.mastery < 80) {
    reasons.push(`Mastery is developing (${topic.mastery}%)`);
  }

  const lastSession = getLastSessionForTopic(sessions, topic.id);
  if (!lastSession) {
    score += 20;
    reasons.push('Not studied yet');
  } else {
    const inactiveDays = daysSince(lastSession.startTime);
    if (inactiveDays >= 7) {
      score += 15;
      reasons.push(`Not studied for ${inactiveDays} days`);
    } else if (inactiveDays >= 3) {
      score += 10;
      reasons.push(`Last studied ${inactiveDays} days ago`);
    }
  }

  if (quizResults && quizResults.length > 0) {
    const recentResults = quizResults.slice(-3);
    const avgScore = recentResults.reduce((sum, r) => sum + (r.score / r.totalQuestions) * 100, 0) / recentResults.length;
    if (avgScore < 60) {
      score += 10;
      reasons.push(`Recent quiz performance: ${Math.round(avgScore)}%`);
    }
  }

  return { score, reasons };
}

export function getStudyRecommendation(
  input: RecommendationInput
): StudyRecommendation | null {
  const { subjects, topics, assessments, studySessions } = input;

  if (subjects.length === 0) return null;
  if (topics.length === 0) return null;

  const scoredTopics: Array<{
    topic: Topic;
    subject: Subject;
    score: number;
    reasons: string[];
  }> = [];

  for (const topic of topics) {
    const subject = subjects.find(s => s.id === topic.subjectId);
    if (!subject) continue;

    const { score, reasons } = calculateTopicScore(
      topic,
      subject,
      assessments,
      studySessions,
      input.flashcards,
      input.quizResults,
    );

    scoredTopics.push({ topic, subject, score, reasons });
  }

  scoredTopics.sort((a, b) => b.score - a.score);

  const best = scoredTopics[0];
  if (!best || best.score === 0) return null;

  const suggestedMinutes = best.score > 60 ? 45 : best.score > 30 ? 30 : 20;

  return {
    subjectId: best.subject.id,
    subjectName: best.subject.name,
    subjectIcon: best.subject.icon,
    subjectColour: best.subject.colour,
    topicId: best.topic.id,
    topicName: best.topic.name,
    reasons: best.reasons.slice(0, 3),
    priority: best.score > 50 ? 'high' : best.score > 25 ? 'medium' : 'low',
    score: Math.round(best.score),
    suggestedMinutes,
  };
}

export function getAllRecommendations(
  input: RecommendationInput,
  limit: number = 5
): StudyRecommendation[] {
  const { subjects, topics, assessments, studySessions } = input;

  if (subjects.length === 0 || topics.length === 0) return [];

  const scoredTopics: Array<{
    topic: Topic;
    subject: Subject;
    score: number;
    reasons: string[];
  }> = [];

  for (const topic of topics) {
    const subject = subjects.find(s => s.id === topic.subjectId);
    if (!subject) continue;

    const { score, reasons } = calculateTopicScore(
      topic,
      subject,
      assessments,
      studySessions,
      input.flashcards,
      input.quizResults,
    );

    if (score > 0) {
      scoredTopics.push({ topic, subject, score, reasons });
    }
  }

  scoredTopics.sort((a, b) => b.score - a.score);

  return scoredTopics.slice(0, limit).map(item => ({
    subjectId: item.subject.id,
    subjectName: item.subject.name,
    subjectIcon: item.subject.icon,
    subjectColour: item.subject.colour,
    topicId: item.topic.id,
    topicName: item.topic.name,
    reasons: item.reasons.slice(0, 3),
    priority: item.score > 50 ? 'high' as const : item.score > 25 ? 'medium' as const : 'low' as const,
    score: Math.round(item.score),
    suggestedMinutes: item.score > 60 ? 45 : item.score > 30 ? 30 : 20,
  }));
}
