'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Dialog,
  Input,
  EmptyState,
  PageHeader,
  Badge,
} from '@/components/ui';
import {
  flashcardStorage,
  flashcardDeckStorage,
  subjectStorage,
} from '@/lib/storage';
import { Flashcard, FlashcardDeck, Subject } from '@/types';
import {
  reviewCard,
  getDueCards,
  getCardStats,
} from '@/lib/study/spaced-repetition';

type ViewMode = 'decks' | 'review' | 'cards';

export default function FlashcardsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('decks');
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeck | null>(null);
  const [deckCards, setDeckCards] = useState<Flashcard[]>([]);

  const [isDeckDialogOpen, setIsDeckDialogOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<FlashcardDeck | null>(null);
  const [deckForm, setDeckForm] = useState({ name: '', description: '', subjectId: '' });

  const [isCardDialogOpen, setIsCardDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [cardForm, setCardForm] = useState({ front: '', back: '' });

  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const reviewStateRef = useRef({ isFlipped, reviewComplete, currentReviewIndex, reviewQueue });

  useEffect(() => {
    reviewStateRef.current = { isFlipped, reviewComplete, currentReviewIndex, reviewQueue };
  });

  const loadData = useCallback(async () => {
    try {
      const [decksData, cardsData, subjectsData] = await Promise.all([
        flashcardDeckStorage.getAll(),
        flashcardStorage.getAll(),
        subjectStorage.getAll(),
      ]);
      setDecks(decksData);
      setAllCards(cardsData);
      setSubjects(subjectsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeckCards = useCallback(async (deckId: string) => {
    try {
      const cards = await flashcardStorage.getByDeck(deckId);
      setDeckCards(cards);
    } catch (error) {
      console.error('Failed to load cards:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedDeck) {
      loadDeckCards(selectedDeck.id);
    }
  }, [selectedDeck, loadDeckCards]);

  const getSubjectName = (subjectId: string) => {
    return subjects.find((s) => s.id === subjectId)?.name ?? 'Unknown';
  };

  const getDeckCardStats = (deckId: string) => {
    return getCardStats(allCards.filter((c) => c.deckId === deckId));
  };

  const handleCreateDeck = async () => {
    if (!deckForm.name.trim() || !deckForm.subjectId) return;

    const now = new Date().toISOString();
    const deck: FlashcardDeck = {
      id: crypto.randomUUID(),
      subjectId: deckForm.subjectId,
      name: deckForm.name,
      description: deckForm.description || null,
      createdAt: now,
      updatedAt: now,
    };

    await flashcardDeckStorage.create(deck);
    resetDeckForm();
    setIsDeckDialogOpen(false);
    loadData();
  };

  const handleEditDeck = async () => {
    if (!editingDeck || !deckForm.name.trim()) return;

    const updated: FlashcardDeck = {
      ...editingDeck,
      name: deckForm.name,
      description: deckForm.description || null,
      subjectId: deckForm.subjectId,
      updatedAt: new Date().toISOString(),
    };

    await flashcardDeckStorage.update(updated);
    resetDeckForm();
    setEditingDeck(null);
    setIsDeckDialogOpen(false);
    if (selectedDeck?.id === updated.id) setSelectedDeck(updated);
    loadData();
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Delete this deck and all its cards?')) return;

    const cards = await flashcardStorage.getByDeck(deckId);
    for (const card of cards) {
      await flashcardStorage.delete(card.id);
    }
    await flashcardDeckStorage.delete(deckId);

    if (selectedDeck?.id === deckId) {
      setSelectedDeck(null);
      setViewMode('decks');
    }
    loadData();
  };

  const resetDeckForm = () => {
    setDeckForm({ name: '', description: '', subjectId: '' });
  };

  const openEditDeckDialog = (deck: FlashcardDeck) => {
    setEditingDeck(deck);
    setDeckForm({ name: deck.name, description: deck.description ?? '', subjectId: deck.subjectId });
    setIsDeckDialogOpen(true);
  };

  const openNewDeckDialog = () => {
    setEditingDeck(null);
    resetDeckForm();
    if (subjects.length > 0 && !deckForm.subjectId) {
      setDeckForm((prev) => ({ ...prev, subjectId: subjects[0].id }));
    }
    setIsDeckDialogOpen(true);
  };

  const enterReviewMode = async (deck: FlashcardDeck) => {
    const cards = await flashcardStorage.getByDeck(deck.id);
    const due = getDueCards(cards);
    setSelectedDeck(deck);
    setReviewQueue(due);
    setCurrentReviewIndex(0);
    setIsFlipped(false);
    setReviewComplete(false);
    setReviewedCount(0);
    setViewMode('review');
  };

  const handleRating = async (rating: 1 | 2 | 3 | 4) => {
    const state = reviewStateRef.current;
    const card = state.reviewQueue[state.currentReviewIndex];
    if (!card) return;

    const updated = reviewCard(card, rating);
    await flashcardStorage.update(updated);

    setReviewedCount((c) => c + 1);

    if (state.currentReviewIndex + 1 >= state.reviewQueue.length) {
      setReviewComplete(true);
    } else {
      setCurrentReviewIndex((i) => i + 1);
      setIsFlipped(false);
    }
  };

  const handleFlip = () => setIsFlipped((f) => !f);

  const exitReviewMode = () => {
    setViewMode('decks');
    setSelectedDeck(null);
    setReviewQueue([]);
    setCurrentReviewIndex(0);
    setIsFlipped(false);
    setReviewComplete(false);
    setReviewedCount(0);
    loadData();
  };

  const handleCreateCard = async () => {
    if (!selectedDeck || !cardForm.front.trim() || !cardForm.back.trim()) return;

    const now = new Date().toISOString();
    const card: Flashcard = {
      id: crypto.randomUUID(),
      deckId: selectedDeck.id,
      front: cardForm.front,
      back: cardForm.back,
      difficulty: 50,
      nextReview: now,
      interval: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
    };

    await flashcardStorage.create(card);
    setCardForm({ front: '', back: '' });
    setIsCardDialogOpen(false);
    loadDeckCards(selectedDeck.id);
    loadData();
  };

  const handleEditCard = async () => {
    if (!editingCard || !cardForm.front.trim() || !cardForm.back.trim()) return;

    const updated: Flashcard = {
      ...editingCard,
      front: cardForm.front,
      back: cardForm.back,
      updatedAt: new Date().toISOString(),
    };

    await flashcardStorage.update(updated);
    setEditingCard(null);
    setCardForm({ front: '', back: '' });
    setIsCardDialogOpen(false);
    if (selectedDeck) loadDeckCards(selectedDeck.id);
    loadData();
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm('Delete this card?')) return;
    await flashcardStorage.delete(cardId);
    if (selectedDeck) loadDeckCards(selectedDeck.id);
    loadData();
  };

  const openEditCardDialog = (card: Flashcard) => {
    setEditingCard(card);
    setCardForm({ front: card.front, back: card.back });
    setIsCardDialogOpen(true);
  };

  const openNewCardDialog = () => {
    setEditingCard(null);
    setCardForm({ front: '', back: '' });
    setIsCardDialogOpen(true);
  };

  useEffect(() => {
    if (viewMode !== 'review') return;

    const handler = (e: KeyboardEvent) => {
      const { isFlipped: flipped, reviewComplete: complete } = reviewStateRef.current;

      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!complete) {
          setIsFlipped((f) => !f);
        }
        return;
      }

      if (!flipped || complete) return;
      if (e.key === '1') { handleRating(1); return; }
      if (e.key === '2') { handleRating(2); return; }
      if (e.key === '3') { handleRating(3); return; }
      if (e.key === '4') { handleRating(4); return; }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === 'review') {
    const currentCard = reviewQueue[currentReviewIndex];
    const stats = selectedDeck ? getDeckCardStats(selectedDeck.id) : { total: 0, due: 0, newCards: 0, learning: 0, mastered: 0 };

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <Button variant="ghost" onClick={exitReviewMode}>
            Exit Review
          </Button>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {selectedDeck?.name}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {reviewQueue.length - (reviewComplete ? 0 : currentReviewIndex + 1)} due remaining
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          {reviewComplete ? (
            <Card className="w-full max-w-md text-center">
              <CardContent className="p-8">
                <div className="text-6xl mb-4">&#127881;</div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Session Complete!
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  You reviewed {reviewedCount} card{reviewedCount !== 1 ? 's' : ''}.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">{stats.mastered}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Mastered</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{stats.learning}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Learning</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.newCards}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">New</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={exitReviewMode} className="flex-1">
                    Back to Decks
                  </Button>
                  {selectedDeck && (
                    <Button
                      variant="secondary"
                      onClick={() => setViewMode('cards')}
                      className="flex-1"
                    >
                      Manage Cards
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : currentCard ? (
            <div className="w-full max-w-lg">
              <div className="text-center mb-4 text-sm text-gray-500 dark:text-gray-400">
                Card {currentReviewIndex + 1} of {reviewQueue.length}
              </div>

              <button
                onClick={handleFlip}
                className="w-full min-h-[280px] p-8 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-all cursor-pointer select-none"
              >
                <div className="text-lg text-gray-900 dark:text-white whitespace-pre-wrap">
                  {isFlipped ? currentCard.back : currentCard.front}
                </div>
                <div className="mt-6 text-sm text-gray-400 dark:text-gray-500">
                  {isFlipped ? 'Back' : 'Front'} &middot; Click to flip
                </div>
              </button>

              {isFlipped ? (
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => handleRating(1)}
                    className="flex-1 py-3 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    Again
                    <span className="block text-xs opacity-75 mt-0.5">1</span>
                  </button>
                  <button
                    onClick={() => handleRating(2)}
                    className="flex-1 py-3 rounded-xl font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors"
                  >
                    Hard
                    <span className="block text-xs opacity-75 mt-0.5">2</span>
                  </button>
                  <button
                    onClick={() => handleRating(3)}
                    className="flex-1 py-3 rounded-xl font-medium text-white bg-green-500 hover:bg-green-600 transition-colors"
                  >
                    Good
                    <span className="block text-xs opacity-75 mt-0.5">3</span>
                  </button>
                  <button
                    onClick={() => handleRating(4)}
                    className="flex-1 py-3 rounded-xl font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors"
                  >
                    Easy
                    <span className="block text-xs opacity-75 mt-0.5">4</span>
                  </button>
                </div>
              ) : (
                <div className="text-center mt-6">
                  <span className="text-sm text-gray-400 dark:text-gray-500">
                    Press Space to flip
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400">
              No due cards to review.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (viewMode === 'cards' && selectedDeck) {
    return (
      <DashboardLayout>
        <div className="mb-6">
          <button
            onClick={() => {
              setViewMode('decks');
              setSelectedDeck(null);
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
          >
            &larr; Back to Decks
          </button>
          <PageHeader
            title={selectedDeck.name}
            description={selectedDeck.description ?? undefined}
            action={
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => enterReviewMode(selectedDeck)}>
                  Review
                </Button>
                <Button onClick={openNewCardDialog}>Add Card</Button>
              </div>
            }
          />
        </div>

        {deckCards.length === 0 ? (
          <EmptyState
            icon={<span className="text-6xl">&#128196;</span>}
            title="No cards yet"
            description="Add your first flashcard to start building this deck."
            action={{ label: 'Add Card', onClick: openNewCardDialog }}
          />
        ) : (
          <div className="space-y-3">
            {deckCards.map((card) => (
              <Card key={card.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {card.front}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                        {card.back}
                      </div>
                      <div className="flex gap-2 mt-2">
                        {card.interval === 0 && <Badge variant="info">New</Badge>}
                        {card.interval > 0 && card.interval < 21 && <Badge variant="warning">Learning</Badge>}
                        {card.interval >= 21 && <Badge variant="success">Mastered</Badge>}
                        <Badge variant="default">EF {card.easeFactor.toFixed(1)}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditCardDialog(card)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCard(card.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog
          isOpen={isCardDialogOpen}
          onClose={() => { setIsCardDialogOpen(false); setEditingCard(null); }}
          title={editingCard ? 'Edit Card' : 'Add Card'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Front
              </label>
              <textarea
                value={cardForm.front}
                onChange={(e) => setCardForm({ ...cardForm, front: e.target.value })}
                placeholder="Question or term..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Back
              </label>
              <textarea
                value={cardForm.back}
                onChange={(e) => setCardForm({ ...cardForm, back: e.target.value })}
                placeholder="Answer or definition..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={editingCard ? handleEditCard : handleCreateCard} className="flex-1">
                {editingCard ? 'Save Changes' : 'Add Card'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setIsCardDialogOpen(false); setEditingCard(null); }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Dialog>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Flashcards"
        description="Study with spaced repetition flashcards"
        action={<Button onClick={openNewDeckDialog}>New Deck</Button>}
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">&#129517;</span>}
          title="No decks yet"
          description="Create your first flashcard deck to start studying."
          action={{ label: 'New Deck', onClick: openNewDeckDialog }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map((deck) => {
            const stats = getDeckCardStats(deck.id);
            return (
              <Card key={deck.id} className="hover:shadow-md transition-shadow flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {deck.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {getSubjectName(deck.subjectId)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditDeckDialog(deck)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteDeck(deck.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  {deck.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                      {deck.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-sm mb-4">
                    <span>
                      <span className="font-semibold text-gray-900 dark:text-white">{stats.total}</span>{' '}
                      <span className="text-gray-500 dark:text-gray-400">cards</span>
                    </span>
                    {stats.due > 0 && <Badge variant="warning">{stats.due} due</Badge>}
                    {stats.newCards > 0 && <Badge variant="info">{stats.newCards} new</Badge>}
                    {stats.mastered > 0 && <Badge variant="success">{stats.mastered} mastered</Badge>}
                  </div>
                  <div className="mt-auto flex gap-3">
                    <Button
                      className="flex-1"
                      onClick={() => enterReviewMode(deck)}
                      disabled={stats.due === 0 && stats.newCards === 0}
                    >
                      Review
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => { setSelectedDeck(deck); setViewMode('cards'); }}
                    >
                      Cards
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        isOpen={isDeckDialogOpen}
        onClose={() => { setIsDeckDialogOpen(false); setEditingDeck(null); }}
        title={editingDeck ? 'Edit Deck' : 'New Deck'}
      >
        <div className="space-y-4">
          <Input
            label="Deck Name"
            value={deckForm.name}
            onChange={(e) => setDeckForm({ ...deckForm, name: e.target.value })}
            placeholder="e.g., Biology Chapter 5"
          />
          <Input
            label="Description (optional)"
            value={deckForm.description}
            onChange={(e) => setDeckForm({ ...deckForm, description: e.target.value })}
            placeholder="A short description..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject
            </label>
            {subjects.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Create a subject first in the Subjects page.
              </p>
            ) : (
              <select
                value={deckForm.subjectId}
                onChange={(e) => setDeckForm({ ...deckForm, subjectId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={editingDeck ? handleEditDeck : handleCreateDeck} className="flex-1">
              {editingDeck ? 'Save Changes' : 'Create Deck'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setIsDeckDialogOpen(false); setEditingDeck(null); }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
