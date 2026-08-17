'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Dialog,
  Input,
  EmptyState,
  Progress,
  Badge,
} from '@/components/ui';
import {
  subjectStorage,
  topicStorage,
  assessmentStorage,
  studySessionStorage,
  flashcardDeckStorage,
  flashcardStorage,
  quizStorage,
  quizResultStorage,
} from '@/lib/storage';
import {
  Subject,
  Topic,
  Assessment,
  StudySession,
  FlashcardDeck,
  Quiz,
  QuizResult,
} from '@/types';
import { useParams } from 'next/navigation';

type Tab = 'overview' | 'topics' | 'assessments' | 'activity' | 'flashcards' | 'quizzes';

const tabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'topics', label: 'Topics' },
  { key: 'assessments', label: 'Assessments' },
  { key: 'activity', label: 'Activity' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'quizzes', label: 'Quizzes' },
];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function SubjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const subjectId = params.id as string;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [deckCardCounts, setDeckCardCounts] = useState<Record<string, number>>({});
  const [quizLatestScores, setQuizLatestScores] = useState<Record<string, QuizResult | null>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [isAddTopicDialogOpen, setIsAddTopicDialogOpen] = useState(false);
  const [isEditTopicDialogOpen, setIsEditTopicDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [newTopic, setNewTopic] = useState({ name: '', mastery: 0 });

  const loadData = async () => {
    try {
      const [
        subjectData,
        topicsData,
        assessmentsData,
        sessionsData,
        decksData,
        quizzesData,
      ] = await Promise.all([
        subjectStorage.get(subjectId),
        topicStorage.getBySubject(subjectId),
        assessmentStorage.getBySubject(subjectId),
        studySessionStorage.getBySubject(subjectId),
        flashcardDeckStorage.getBySubject(subjectId),
        quizStorage.getBySubject(subjectId),
      ]);

      setSubject(subjectData);
      setTopics(topicsData);
      setAssessments(assessmentsData);
      setSessions(sessionsData);
      setDecks(decksData);
      setQuizzes(quizzesData);

      const counts: Record<string, number> = {};
      await Promise.all(
        decksData.map(async (deck) => {
          const cards = await flashcardStorage.getByDeck(deck.id);
          counts[deck.id] = cards.length;
        })
      );
      setDeckCardCounts(counts);

      const scores: Record<string, QuizResult | null> = {};
      await Promise.all(
        quizzesData.map(async (quiz) => {
          const results = await quizResultStorage.getByQuiz(quiz.id);
          const latest = results.length > 0
            ? results.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
            : null;
          scores[quiz.id] = latest;
        })
      );
      setQuizLatestScores(scores);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const handleAddTopic = async () => {
    if (!newTopic.name.trim()) return;
    const topic: Topic = {
      id: crypto.randomUUID(),
      subjectId,
      name: newTopic.name,
      mastery: newTopic.mastery,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await topicStorage.create(topic);
    setNewTopic({ name: '', mastery: 0 });
    setIsAddTopicDialogOpen(false);
    loadData();
  };

  const handleEditTopic = async () => {
    if (!editingTopic || !newTopic.name.trim()) return;
    const updatedTopic: Topic = {
      ...editingTopic,
      name: newTopic.name,
      mastery: newTopic.mastery,
      updatedAt: new Date().toISOString(),
    };
    await topicStorage.update(updatedTopic);
    setEditingTopic(null);
    setNewTopic({ name: '', mastery: 0 });
    setIsEditTopicDialogOpen(false);
    loadData();
  };

  const handleDeleteTopic = async (id: string) => {
    if (!confirm('Are you sure you want to delete this topic?')) return;
    await topicStorage.delete(id);
    loadData();
  };

  const openEditTopicDialog = (topic: Topic) => {
    setEditingTopic(topic);
    setNewTopic({ name: topic.name, mastery: topic.mastery });
    setIsEditTopicDialogOpen(true);
  };

  const getOverallProgress = (): number => {
    if (topics.length === 0) return 0;
    const avgMastery = topics.reduce((sum, t) => sum + t.mastery, 0) / topics.length;
    return Math.round(avgMastery);
  };

  const getTotalStudyMinutes = (): number => {
    return sessions.reduce((sum, s) => sum + s.duration, 0);
  };

  const upcomingAssessments = assessments.filter((a) => a.status === 'upcoming');
  const completedAssessments = assessments.filter((a) => a.status === 'completed');

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
            <div className="h-12 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
          <div className="flex gap-2 mb-6">
            {tabs.map((t) => (
              <div key={t.key} className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!subject) {
    return (
      <DashboardLayout>
        <EmptyState
          icon={<span className="text-6xl">📚</span>}
          title="Subject not found"
          description="The subject you're looking for doesn't exist or has been deleted."
          action={{
            label: 'Back to Subjects',
            onClick: () => router.push('/subjects'),
          }}
        />
      </DashboardLayout>
    );
  }

  const renderOverviewTab = () => {
    const avgMastery = topics.length > 0
      ? Math.round(topics.reduce((sum, t) => sum + t.mastery, 0) / topics.length)
      : 0;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Topics</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{topics.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Avg. mastery {avgMastery}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Assessments</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{assessments.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {upcomingAssessments.length} upcoming · {completedAssessments.length} done
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Study Time</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {formatDuration(getTotalStudyMinutes())}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Overall Progress</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{getOverallProgress()}%</p>
              <div className="mt-2">
                <Progress value={getOverallProgress()} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No study sessions yet. Start studying to see activity here.</p>
            ) : (
              <div className="space-y-3">
                {sessions
                  .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                  .slice(0, 5)
                  .map((session) => {
                    const topic = topics.find((t) => t.id === session.topicId);
                    return (
                      <div key={session.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {topic ? topic.name : 'General study'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(session.startTime).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="info">{formatDuration(session.duration)}</Badge>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTopicsTab = () => (
    <>
      <div className="flex justify-end mb-6">
        <Button onClick={() => setIsAddTopicDialogOpen(true)}>Add Topic</Button>
      </div>
      {topics.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">📝</span>}
          title="No topics yet"
          description="Add topics to break down this subject into manageable parts."
          action={{
            label: 'Add Topic',
            onClick: () => setIsAddTopicDialogOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {topics.map((topic) => (
            <Card key={topic.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{topic.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Last updated {new Date(topic.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditTopicDialog(topic)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTopic(topic.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Mastery</span>
                      <span className="font-medium text-gray-900 dark:text-white">{topic.mastery}%</span>
                    </div>
                    <Progress value={topic.mastery} />
                  </div>
                  <Badge variant={topic.mastery >= 80 ? 'success' : topic.mastery >= 50 ? 'warning' : 'danger'}>
                    {topic.mastery >= 80 ? 'Mastered' : topic.mastery >= 50 ? 'In Progress' : 'Needs Work'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  const renderAssessmentsTab = () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Upcoming ({upcomingAssessments.length})
        </h3>
        {upcomingAssessments.length === 0 ? (
          <EmptyState
            icon={<span className="text-6xl">📅</span>}
            title="No upcoming assessments"
            description="No assessments are scheduled for this subject."
          />
        ) : (
          <div className="space-y-4">
            {upcomingAssessments
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((assessment) => {
                const days = daysUntil(assessment.date);
                return (
                  <Card key={assessment.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">{assessment.name}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {new Date(assessment.date).toLocaleDateString()} · Weighting: {assessment.weighting}%
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant={days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'info'}>
                            {days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                          </Badge>
                          {assessment.targetScore > 0 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Target: {assessment.targetScore}%
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Completed ({completedAssessments.length})
        </h3>
        {completedAssessments.length === 0 ? (
          <EmptyState
            icon={<span className="text-6xl">✅</span>}
            title="No completed assessments"
            description="Completed assessments will appear here."
          />
        ) : (
          <div className="space-y-4">
            {completedAssessments
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((assessment) => (
                <Card key={assessment.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">{assessment.name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(assessment.date).toLocaleDateString()} · Weighting: {assessment.weighting}%
                        </p>
                      </div>
                      <div className="text-right">
                        {assessment.actualScore !== null ? (
                          <Badge variant={assessment.actualScore >= 80 ? 'success' : assessment.actualScore >= 50 ? 'warning' : 'danger'}>
                            {assessment.actualScore}%
                          </Badge>
                        ) : (
                          <Badge variant="default">No score</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderActivityTab = () => {
    const recentSessions = [...sessions]
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 10);

    return (
      <>
        {recentSessions.length === 0 ? (
          <EmptyState
            icon={<span className="text-6xl">⏱️</span>}
            title="No study sessions"
            description="Start a study session to track your progress and activity."
          />
        ) : (
          <div className="space-y-4">
            {recentSessions.map((session) => {
              const topic = topics.find((t) => t.id === session.topicId);
              return (
                <Card key={session.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {topic ? topic.name : 'General study'}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(session.startTime).toLocaleDateString()} at{' '}
                          {new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {session.notes && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{session.notes}</p>
                        )}
                      </div>
                      <Badge variant="info">{formatDuration(session.duration)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderFlashcardsTab = () => (
    <>
      {decks.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">🃏</span>}
          title="No flashcard decks"
          description="Create flashcard decks to study key concepts for this subject."
          action={{
            label: 'Create Deck',
            onClick: () => router.push('/flashcards'),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <Card
              key={deck.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/flashcards?deck=${deck.id}`)}
            >
              <CardContent className="py-6">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{deck.name}</h4>
                {deck.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{deck.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <Badge variant="info">
                    {deckCardCounts[deck.id] ?? 0} card{(deckCardCounts[deck.id] ?? 0) !== 1 ? 's' : ''}
                  </Badge>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(deck.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  const renderQuizzesTab = () => (
    <>
      {quizzes.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">❓</span>}
          title="No quizzes"
          description="Create quizzes to test your knowledge for this subject."
          action={{
            label: 'Create Quiz',
            onClick: () => router.push('/quizzes'),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quizzes.map((quiz) => {
            const latest = quizLatestScores[quiz.id];
            return (
              <Card
                key={quiz.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/quizzes?quiz=${quiz.id}`)}
              >
                <CardContent className="py-6">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{quiz.name}</h4>
                  {quiz.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{quiz.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    {latest ? (
                      <Badge
                        variant={
                          (latest.score / latest.totalQuestions) * 100 >= 80
                            ? 'success'
                            : (latest.score / latest.totalQuestions) * 100 >= 50
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        Last: {latest.score}/{latest.totalQuestions}
                      </Badge>
                    ) : (
                      <Badge variant="default">Not attempted</Badge>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(quiz.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );

  const tabContent: Record<Tab, React.ReactNode> = {
    overview: renderOverviewTab(),
    topics: renderTopicsTab(),
    assessments: renderAssessmentsTab(),
    activity: renderActivityTab(),
    flashcards: renderFlashcardsTab(),
    quizzes: renderQuizzesTab(),
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shrink-0"
            style={{ backgroundColor: `${subject.colour}20` }}
          >
            {subject.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white truncate">
              {subject.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {topics.length} topic{topics.length !== 1 ? 's' : ''} · Created {new Date(subject.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Overall Progress</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{getOverallProgress()}%</p>
          </div>
        </div>
        <div className="mt-4">
          <Progress value={getOverallProgress()} size="lg" />
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>{tabContent[activeTab]}</div>

      <Dialog isOpen={isAddTopicDialogOpen} onClose={() => setIsAddTopicDialogOpen(false)} title="Add Topic">
        <div className="space-y-4">
          <Input
            label="Topic Name"
            value={newTopic.name}
            onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
            placeholder="e.g., Algebra basics"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Initial Mastery: {newTopic.mastery}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={newTopic.mastery}
              onChange={(e) => setNewTopic({ ...newTopic, mastery: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddTopic} className="flex-1">Add Topic</Button>
            <Button variant="secondary" onClick={() => setIsAddTopicDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={isEditTopicDialogOpen} onClose={() => setIsEditTopicDialogOpen(false)} title="Edit Topic">
        <div className="space-y-4">
          <Input
            label="Topic Name"
            value={newTopic.name}
            onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
            placeholder="e.g., Algebra basics"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mastery: {newTopic.mastery}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={newTopic.mastery}
              onChange={(e) => setNewTopic({ ...newTopic, mastery: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleEditTopic} className="flex-1">Save Changes</Button>
            <Button variant="secondary" onClick={() => setIsEditTopicDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
