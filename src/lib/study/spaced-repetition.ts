import { Flashcard } from '@/types';

export function reviewCard(
  card: Flashcard,
  rating: 1 | 2 | 3 | 4,
): Flashcard {
  const now = new Date();

  if (rating === 1) {
    return {
      ...card,
      interval: 1,
      easeFactor: Math.max(1.3, card.easeFactor - 0.2),
      nextReview: new Date(now.getTime() + 1 * 60 * 1000).toISOString(),
      difficulty: Math.min(100, card.difficulty + 10),
      updatedAt: now.toISOString(),
    };
  }

  let newInterval: number;
  let newEaseFactor = card.easeFactor;

  if (card.interval === 0) {
    if (rating === 2) {
      newInterval = 1;
    } else if (rating === 3) {
      newInterval = 1;
    } else {
      newInterval = 4;
    }
  } else if (card.interval === 1) {
    if (rating === 2) {
      newInterval = 1;
    } else if (rating === 3) {
      newInterval = 6;
    } else {
      newInterval = 10;
    }
  } else {
    if (rating === 2) {
      newInterval = Math.round(card.interval * 1.2);
    } else if (rating === 3) {
      newInterval = Math.round(card.interval * card.easeFactor);
    } else {
      newInterval = Math.round(card.interval * card.easeFactor * 1.3);
    }
  }

  const ratingFactor = rating === 2 ? -0.15 : rating === 3 ? 0 : 0.15;
  newEaseFactor = card.easeFactor + ratingFactor;
  newEaseFactor = Math.max(1.3, newEaseFactor);

  const difficultyChange =
    rating === 2 ? -5 : rating === 3 ? -10 : -15;
  const newDifficulty = Math.max(0, Math.min(100, card.difficulty + difficultyChange));

  const intervalMs = newInterval * 24 * 60 * 60 * 1000;

  return {
    ...card,
    interval: newInterval,
    easeFactor: newEaseFactor,
    nextReview: new Date(now.getTime() + intervalMs).toISOString(),
    difficulty: newDifficulty,
    updatedAt: now.toISOString(),
  };
}

export function getDueCards(cards: Flashcard[]): Flashcard[] {
  const now = new Date();
  return cards
    .filter((card) => new Date(card.nextReview) <= now)
    .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());
}

export function getNewCards(cards: Flashcard[]): Flashcard[] {
  return cards.filter((card) => card.interval === 0);
}

export function getCardStats(cards: Flashcard[]): {
  total: number;
  due: number;
  newCards: number;
  learning: number;
  mastered: number;
} {
  const now = new Date();
  const due = cards.filter((c) => new Date(c.nextReview) <= now).length;
  const newCards = cards.filter((c) => c.interval === 0).length;
  const learning = cards.filter((c) => c.interval > 0 && c.interval < 21).length;
  const mastered = cards.filter((c) => c.interval >= 21).length;

  return { total: cards.length, due, newCards, learning, mastered };
}
