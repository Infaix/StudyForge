import { describe, it, expect } from 'vitest';
import { getStudyRecommendation, getAllRecommendations, RecommendationInput } from '../recommendations';
import { Subject, Topic, Assessment } from '@/types';

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: crypto.randomUUID(),
    name: 'Physics',
    colour: '#3B82F6',
    icon: '🔬',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: crypto.randomUUID(),
    subjectId: 'subject-1',
    name: 'Waves',
    mastery: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  return {
    id: crypto.randomUUID(),
    subjectId: 'subject-1',
    name: 'Midterm',
    date: futureDate.toISOString().split('T')[0],
    weighting: 30,
    targetScore: 70,
    actualScore: null,
    status: 'upcoming',
    ...overrides,
  };
}

describe('getStudyRecommendation', () => {
  it('returns null when no subjects', () => {
    const input: RecommendationInput = {
      subjects: [],
      topics: [],
      assessments: [],
      studySessions: [],
    };
    expect(getStudyRecommendation(input)).toBeNull();
  });

  it('returns null when no topics', () => {
    const input: RecommendationInput = {
      subjects: [makeSubject({ id: 's1' })],
      topics: [],
      assessments: [],
      studySessions: [],
    };
    expect(getStudyRecommendation(input)).toBeNull();
  });

  it('returns a recommendation when topics exist', () => {
    const input: RecommendationInput = {
      subjects: [makeSubject({ id: 's1' })],
      topics: [makeTopic({ subjectId: 's1', mastery: 30 })],
      assessments: [],
      studySessions: [],
    };
    const result = getStudyRecommendation(input);
    expect(result).not.toBeNull();
    expect(result?.subjectName).toBe('Physics');
    expect(result?.topicName).toBe('Waves');
  });

  it('prioritises topics with upcoming assessments', () => {
    const subject = makeSubject({ id: 's1' });
    const input: RecommendationInput = {
      subjects: [subject],
      topics: [
        makeTopic({ id: 't1', subjectId: 's1', name: 'Waves', mastery: 80 }),
        makeTopic({ id: 't2', subjectId: 's1', name: 'Optics', mastery: 80 }),
      ],
      assessments: [
        makeAssessment({ subjectId: 's1', name: 'Waves Exam', date: getDateStr(3) }),
      ],
      studySessions: [],
    };
    const result = getStudyRecommendation(input);
    expect(result).not.toBeNull();
    expect(result?.topicName).toBe('Waves');
    expect(result?.reasons.length).toBeGreaterThan(0);
    expect(result?.reasons.some(r => r.includes('Waves Exam'))).toBe(true);
  });

  it('gives high priority to topics with very close assessments', () => {
    const input: RecommendationInput = {
      subjects: [makeSubject({ id: 's1' })],
      topics: [makeTopic({ subjectId: 's1', mastery: 40 })],
      assessments: [
        makeAssessment({ subjectId: 's1', date: getDateStr(1), weighting: 50 }),
      ],
      studySessions: [],
    };
    const result = getStudyRecommendation(input);
    expect(result?.priority).toBe('high');
  });

  it('includes reasons in recommendation', () => {
    const input: RecommendationInput = {
      subjects: [makeSubject({ id: 's1' })],
      topics: [makeTopic({ subjectId: 's1', mastery: 20 })],
      assessments: [
        makeAssessment({ subjectId: 's1', date: getDateStr(2) }),
      ],
      studySessions: [],
    };
    const result = getStudyRecommendation(input);
    expect(result?.reasons.length).toBeGreaterThan(0);
  });

  it('notes when topic has not been studied', () => {
    const input: RecommendationInput = {
      subjects: [makeSubject({ id: 's1' })],
      topics: [makeTopic({ subjectId: 's1', mastery: 50 })],
      assessments: [],
      studySessions: [],
    };
    const result = getStudyRecommendation(input);
    const notStudied = result?.reasons.some(r => r.includes('Not studied yet'));
    expect(notStudied).toBe(true);
  });
});

describe('getAllRecommendations', () => {
  it('returns empty when no data', () => {
    const input: RecommendationInput = {
      subjects: [],
      topics: [],
      assessments: [],
      studySessions: [],
    };
    expect(getAllRecommendations(input)).toEqual([]);
  });

  it('returns multiple recommendations', () => {
    const input: RecommendationInput = {
      subjects: [makeSubject({ id: 's1' })],
      topics: [
        makeTopic({ id: 't1', subjectId: 's1', name: 'Topic A', mastery: 20 }),
        makeTopic({ id: 't2', subjectId: 's1', name: 'Topic B', mastery: 40 }),
        makeTopic({ id: 't3', subjectId: 's1', name: 'Topic C', mastery: 60 }),
      ],
      assessments: [],
      studySessions: [],
    };
    const results = getAllRecommendations(input);
    expect(results.length).toBe(3);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('respects limit parameter', () => {
    const input: RecommendationInput = {
      subjects: [makeSubject({ id: 's1' })],
      topics: [
        makeTopic({ id: 't1', subjectId: 's1', mastery: 10 }),
        makeTopic({ id: 't2', subjectId: 's1', mastery: 20 }),
        makeTopic({ id: 't3', subjectId: 's1', mastery: 30 }),
      ],
      assessments: [],
      studySessions: [],
    };
    const results = getAllRecommendations(input, 2);
    expect(results.length).toBe(2);
  });
});

function getDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}
