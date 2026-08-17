import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reviewCard, getDueCards, getNewCards, getCardStats } from '../spaced-repetition';
import { Flashcard } from '@/types';

function makeCard(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    front: 'What is 2+2?',
    back: '4',
    difficulty: 50,
    nextReview: new Date().toISOString(),
    interval: 0,
    easeFactor: 2.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('reviewCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  it('resets interval for rating 1 (Again)', () => {
    const card = makeCard({ interval: 10, easeFactor: 2.5 });
    const result = reviewCard(card, 1);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  it('does not drop easeFactor below 1.3', () => {
    const card = makeCard({ interval: 10, easeFactor: 1.3 });
    const result = reviewCard(card, 1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('increases interval for rating 3 (Good) on a reviewed card', () => {
    const card = makeCard({ interval: 6, easeFactor: 2.5 });
    const result = reviewCard(card, 3);
    expect(result.interval).toBeGreaterThan(6);
  });

  it('sets short interval for new card with rating 4 (Easy)', () => {
    const card = makeCard({ interval: 0, easeFactor: 2.5 });
    const result = reviewCard(card, 4);
    expect(result.interval).toBe(4);
  });

  it('sets interval of 1 for new card with rating 3 (Good)', () => {
    const card = makeCard({ interval: 0, easeFactor: 2.5 });
    const result = reviewCard(card, 3);
    expect(result.interval).toBe(1);
  });

  it('updates nextReview to a future date', () => {
    const card = makeCard({ interval: 5, easeFactor: 2.5 });
    const result = reviewCard(card, 3);
    expect(new Date(result.nextReview).getTime()).toBeGreaterThan(Date.now());
  });

  it('updates updatedAt timestamp', () => {
    const card = makeCard();
    const result = reviewCard(card, 3);
    expect(result.updatedAt).toBeTruthy();
  });
});

describe('getDueCards', () => {
  it('returns cards with nextReview in the past', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);

    const cards = [
      makeCard({ id: 'c1', nextReview: pastDate.toISOString() }),
      makeCard({ id: 'c2', nextReview: futureDate.toISOString() }),
    ];
    const due = getDueCards(cards);
    expect(due.length).toBe(1);
    expect(due[0].id).toBe('c1');
  });

  it('returns empty when no cards are due', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const cards = [makeCard({ nextReview: futureDate.toISOString() })];
    expect(getDueCards(cards)).toEqual([]);
  });

  it('sorts by nextReview ascending', () => {
    const d1 = new Date();
    d1.setDate(d1.getDate() - 3);
    const d2 = new Date();
    d2.setDate(d2.getDate() - 1);
    const cards = [
      makeCard({ id: 'c1', nextReview: d2.toISOString() }),
      makeCard({ id: 'c2', nextReview: d1.toISOString() }),
    ];
    const due = getDueCards(cards);
    expect(due[0].id).toBe('c2');
  });
});

describe('getNewCards', () => {
  it('returns cards with interval 0', () => {
    const cards = [
      makeCard({ id: 'c1', interval: 0 }),
      makeCard({ id: 'c2', interval: 5 }),
    ];
    const newCards = getNewCards(cards);
    expect(newCards.length).toBe(1);
    expect(newCards[0].id).toBe('c1');
  });
});

describe('getCardStats', () => {
  it('counts correctly', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 86400000);

    const cards = [
      makeCard({ id: 'c1', interval: 0, nextReview: now.toISOString() }),
      makeCard({ id: 'c2', interval: 5, nextReview: past.toISOString() }),
      makeCard({ id: 'c3', interval: 30, nextReview: future.toISOString() }),
      makeCard({ id: 'c4', interval: 10, nextReview: past.toISOString() }),
    ];
    const stats = getCardStats(cards);
    expect(stats.total).toBe(4);
    expect(stats.newCards).toBe(1);
    expect(stats.mastered).toBe(1);
    expect(stats.learning).toBe(2);
  });
});
