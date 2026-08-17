'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
  quizStorage,
  quizQuestionStorage,
  quizResultStorage,
  subjectStorage,
} from '@/lib/storage';
import { Quiz, QuizQuestion, QuizResult, Subject } from '@/types';
import { gradeQuiz } from '@/lib/study/quiz-engine';

type View = 'list' | 'builder' | 'taking' | 'results';

type QuestionType = QuizQuestion['type'];

interface QuestionFormState {
  question: string;
  type: QuestionType;
  options: string[];
  correctAnswer: number | string;
  explanation: string;
}

const emptyQuestionForm: QuestionFormState = {
  question: '',
  type: 'multiple-choice',
  options: ['', '', '', ''],
  correctAnswer: 0,
  explanation: '',
};

export default function QuizzesPage() {
  const [view, setView] = useState<View>('list');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [allResults, setAllResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Quiz list state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [quizForm, setQuizForm] = useState({ name: '', description: '', subjectId: '' });

  // Builder state
  const [builderQuiz, setBuilderQuiz] = useState<Quiz | null>(null);
  const [builderQuestions, setBuilderQuestions] = useState<QuizQuestion[]>([]);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(emptyQuestionForm);
  const [deleteQuestionConfirmId, setDeleteQuestionConfirmId] = useState<string | null>(null);

  // Taking state
  const [takingQuiz, setTakingQuiz] = useState<Quiz | null>(null);
  const [takingQuestions, setTakingQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | string)[]>([]);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);

  // Results state
  const [resultData, setResultData] = useState<{
    quiz: Quiz;
    result: QuizResult;
    questions: QuizQuestion[];
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [quizzesData, subjectsData, questionsData, resultsData] = await Promise.all([
        quizStorage.getAll(),
        subjectStorage.getAll(),
        quizQuestionStorage.getAll(),
        quizResultStorage.getAll(),
      ]);
      setQuizzes(quizzesData);
      setSubjects(subjectsData);
      setAllQuestions(questionsData);
      setAllResults(resultsData);
    } catch (error) {
      console.error('Failed to load quiz data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getSubjectName = (subjectId: string) =>
    subjects.find((s) => s.id === subjectId)?.name ?? 'Unknown';

  const getQuestionCount = (quizId: string) =>
    allQuestions.filter((q) => q.quizId === quizId).length;

  const getLatestResult = (quizId: string): QuizResult | undefined => {
    const quizResults = allResults
      .filter((r) => r.quizId === quizId)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    return quizResults[0];
  };

  // ── Quiz CRUD ──────────────────────────────────────────

  const handleCreateQuiz = async () => {
    if (!quizForm.name.trim() || !quizForm.subjectId) return;
    const now = new Date().toISOString();
    const quiz: Quiz = {
      id: crypto.randomUUID(),
      subjectId: quizForm.subjectId,
      topicId: null,
      name: quizForm.name,
      description: quizForm.description || null,
      createdAt: now,
      updatedAt: now,
    };
    await quizStorage.create(quiz);
    setQuizForm({ name: '', description: '', subjectId: '' });
    setIsCreateDialogOpen(false);
    loadData();
  };

  const handleUpdateQuiz = async () => {
    if (!editingQuiz || !quizForm.name.trim()) return;
    const updated: Quiz = {
      ...editingQuiz,
      name: quizForm.name,
      description: quizForm.description || null,
      subjectId: quizForm.subjectId || editingQuiz.subjectId,
      updatedAt: new Date().toISOString(),
    };
    await quizStorage.update(updated);
    setEditingQuiz(null);
    setQuizForm({ name: '', description: '', subjectId: '' });
    setIsEditDialogOpen(false);
    loadData();
  };

  const handleDeleteQuiz = async (id: string) => {
    await quizStorage.delete(id);
    const questions = allQuestions.filter((q) => q.quizId === id);
    for (const q of questions) await quizQuestionStorage.delete(q.id);
    const results = allResults.filter((r) => r.quizId === id);
    for (const r of results) await quizResultStorage.delete(r.id);
    loadData();
  };

  const openEditDialog = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setQuizForm({ name: quiz.name, description: quiz.description ?? '', subjectId: quiz.subjectId });
    setIsEditDialogOpen(true);
  };

  // ── Builder ────────────────────────────────────────────

  const openBuilder = async (quiz: Quiz) => {
    setBuilderQuiz(quiz);
    const qs = await quizQuestionStorage.getByQuiz(quiz.id);
    setBuilderQuestions(qs);
    setView('builder');
  };

  const handleAddQuestion = async () => {
    if (!builderQuiz || !questionForm.question.trim()) return;
    const question: QuizQuestion = {
      id: crypto.randomUUID(),
      quizId: builderQuiz.id,
      question: questionForm.question,
      type: questionForm.type,
      options: questionForm.type === 'short-answer' ? [] : questionForm.options.filter((o) => o.trim()),
      correctAnswer: questionForm.correctAnswer,
      explanation: questionForm.explanation || null,
    };
    await quizQuestionStorage.create(question);
    setQuestionForm(emptyQuestionForm);
    setIsQuestionDialogOpen(false);
    setEditingQuestion(null);
    const qs = await quizQuestionStorage.getByQuiz(builderQuiz.id);
    setBuilderQuestions(qs);
  };

  const handleUpdateQuestion = async () => {
    if (!builderQuiz || !editingQuestion || !questionForm.question.trim()) return;
    const updated: QuizQuestion = {
      ...editingQuestion,
      question: questionForm.question,
      type: questionForm.type,
      options: questionForm.type === 'short-answer' ? [] : questionForm.options.filter((o) => o.trim()),
      correctAnswer: questionForm.correctAnswer,
      explanation: questionForm.explanation || null,
    };
    await quizQuestionStorage.update(updated);
    setQuestionForm(emptyQuestionForm);
    setIsQuestionDialogOpen(false);
    setEditingQuestion(null);
    const qs = await quizQuestionStorage.getByQuiz(builderQuiz.id);
    setBuilderQuestions(qs);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!builderQuiz) return;
    await quizQuestionStorage.delete(id);
    setDeleteQuestionConfirmId(null);
    const qs = await quizQuestionStorage.getByQuiz(builderQuiz.id);
    setBuilderQuestions(qs);
  };

  const openEditQuestionDialog = (q: QuizQuestion) => {
    setEditingQuestion(q);
    setQuestionForm({
      question: q.question,
      type: q.type,
      options: q.type === 'short-answer' ? ['', '', '', ''] : [...q.options, ...Array(Math.max(0, 4 - q.options.length))].slice(0, 4),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ?? '',
    });
    setIsQuestionDialogOpen(true);
  };

  const openAddQuestionDialog = () => {
    setEditingQuestion(null);
    setQuestionForm(emptyQuestionForm);
    setIsQuestionDialogOpen(true);
  };

  // ── Taking ─────────────────────────────────────────────

  const startQuiz = async (quiz: Quiz) => {
    const qs = await quizQuestionStorage.getByQuiz(quiz.id);
    if (qs.length === 0) return;
    setTakingQuiz(quiz);
    setTakingQuestions(qs);
    setCurrentQuestionIndex(0);
    setAnswers(new Array(qs.length).fill(''));
    setView('taking');
  };

  const setAnswer = (answer: number | string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentQuestionIndex] = answer;
      return next;
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < takingQuestions.length - 1) {
      setCurrentQuestionIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((i) => i - 1);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!takingQuiz) return;
    setIsSubmitConfirmOpen(false);

    const { score, totalQuestions } = gradeQuiz(takingQuestions, answers);
    const result: QuizResult = {
      id: crypto.randomUUID(),
      quizId: takingQuiz.id,
      score,
      totalQuestions,
      completedAt: new Date().toISOString(),
      answers,
    };
    await quizResultStorage.create(result);
    setResultData({ quiz: takingQuiz, result, questions: takingQuestions });
    setView('results');
    loadData();
  };

  const unansweredCount = answers.filter((a) => a === '').length;

  // ── Loading skeleton ───────────────────────────────────

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

  // ── RESULTS VIEW ───────────────────────────────────────

  if (view === 'results' && resultData) {
    const graded = gradeQuiz(resultData.questions, resultData.result.answers);
    const pct = resultData.result.totalQuestions > 0
      ? Math.round((resultData.result.score / resultData.result.totalQuestions) * 100)
      : 0;

    return (
      <DashboardLayout>
        <PageHeader
          title={`Results: ${resultData.quiz.name}`}
          action={
            <Button variant="secondary" onClick={() => { setView('list'); setResultData(null); }}>
              Back to Quizzes
            </Button>
          }
        />

        <Card className="mb-6">
          <CardContent className="flex flex-col items-center py-8">
            <div className="text-5xl font-bold text-gray-900 dark:text-white mb-2">{pct}%</div>
            <p className="text-gray-600 dark:text-gray-400">
              {resultData.result.score} of {resultData.result.totalQuestions} correct
            </p>
            <Badge
              variant={pct >= 70 ? 'success' : pct >= 50 ? 'warning' : 'danger'}
              className="mt-3 text-sm"
            >
              {pct >= 70 ? 'Passed' : pct >= 50 ? 'Needs Improvement' : 'Keep Practising'}
            </Badge>
            <Button className="mt-6" onClick={() => startQuiz(resultData.quiz)}>
              Retake Quiz
            </Button>
          </CardContent>
        </Card>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Question Review</h2>
        <div className="space-y-4">
          {graded.results.map((r, idx) => {
            const userAns = r.userAnswer;
            const correctAns = r.question.correctAnswer;

            let userDisplay = '';
            if (r.question.type === 'multiple-choice') {
              userDisplay = typeof userAns === 'number' ? (r.question.options[userAns] ?? `Option ${userAns + 1}`) : String(userAns);
            } else if (r.question.type === 'true-false') {
              userDisplay = typeof userAns === 'number' ? (userAns === 0 ? 'True' : 'False') : String(userAns);
            } else {
              userDisplay = String(userAns || '(no answer)');
            }

            let correctDisplay = '';
            if (r.question.type === 'multiple-choice') {
              correctDisplay = typeof correctAns === 'number' ? (r.question.options[correctAns] ?? `Option ${(correctAns as number) + 1}`) : String(correctAns);
            } else if (r.question.type === 'true-false') {
              correctDisplay = correctAns === 0 ? 'True' : 'False';
            } else {
              correctDisplay = String(correctAns);
            }

            return (
              <Card key={r.question.id}>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium text-white ${r.correct ? 'bg-green-500' : 'bg-red-500'}`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white mb-2">{r.question.question}</p>
                      <div className="text-sm space-y-1">
                        <p>
                          <span className="text-gray-500 dark:text-gray-400">Your answer: </span>
                          <span className={r.correct ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                            {userDisplay}
                          </span>
                        </p>
                        {!r.correct && (
                          <p>
                            <span className="text-gray-500 dark:text-gray-400">Correct answer: </span>
                            <span className="text-green-600 dark:text-green-400 font-medium">{correctDisplay}</span>
                          </p>
                        )}
                        {r.question.explanation && (
                          <p className="text-gray-600 dark:text-gray-400 italic mt-2">{r.question.explanation}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DashboardLayout>
    );
  }

  // ── TAKE QUIZ VIEW ─────────────────────────────────────

  if (view === 'taking' && takingQuiz && takingQuestions.length > 0) {
    const q = takingQuestions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / takingQuestions.length) * 100;

    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{takingQuiz.name}</h1>
              <Button variant="ghost" size="sm" onClick={() => setView('list')}>Quit</Button>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              <span>Question {currentQuestionIndex + 1} of {takingQuestions.length}</span>
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="py-8">
              <Badge variant="info" className="mb-4">
                {q.type === 'multiple-choice' ? 'Multiple Choice' : q.type === 'true-false' ? 'True / False' : 'Short Answer'}
              </Badge>
              <p className="text-lg text-gray-900 dark:text-white mb-6">{q.question}</p>

              {q.type === 'multiple-choice' && (
                <div className="space-y-3">
                  {q.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setAnswer(i)}
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                        answers[currentQuestionIndex] === i
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-900 dark:text-white'
                      }`}
                    >
                      <span className="font-medium mr-3">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'true-false' && (
                <div className="flex gap-4">
                  {[{ label: 'True', value: 0 }, { label: 'False', value: 1 }].map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setAnswer(value)}
                      className={`flex-1 px-6 py-4 rounded-lg border-2 text-lg font-medium transition-colors ${
                        answers[currentQuestionIndex] === value
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-900 dark:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'short-answer' && (
                <Input
                  label="Your Answer"
                  value={typeof answers[currentQuestionIndex] === 'string' ? (answers[currentQuestionIndex] as string) : ''}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer..."
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between mt-6">
            <Button
              variant="secondary"
              onClick={handlePrev}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </Button>
            {currentQuestionIndex === takingQuestions.length - 1 ? (
              <Button onClick={() => setIsSubmitConfirmOpen(true)}>
                Submit Quiz
              </Button>
            ) : (
              <Button onClick={handleNext}>Next</Button>
            )}
          </div>

          <Dialog isOpen={isSubmitConfirmOpen} onClose={() => setIsSubmitConfirmOpen(false)} title="Submit Quiz?">
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                You have answered {takingQuestions.length - unansweredCount} of {takingQuestions.length} questions.
                {unansweredCount > 0 && (
                  <span className="block mt-1 text-yellow-600 dark:text-yellow-400 font-medium">
                    {unansweredCount} unanswered question{unansweredCount > 1 ? 's' : ''} will be marked incorrect.
                  </span>
                )}
              </p>
              <div className="flex gap-3">
                <Button onClick={handleSubmitQuiz} className="flex-1">Submit</Button>
                <Button variant="secondary" onClick={() => setIsSubmitConfirmOpen(false)} className="flex-1">
                  Review Answers
                </Button>
              </div>
            </div>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  // ── BUILDER VIEW ───────────────────────────────────────

  if (view === 'builder' && builderQuiz) {
    return (
      <DashboardLayout>
        <PageHeader
          title={`Builder: ${builderQuiz.name}`}
          description={`${builderQuestions.length} question${builderQuestions.length !== 1 ? 's' : ''}`}
          action={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => { setView('list'); setBuilderQuiz(null); }}
              >
                Back
              </Button>
              <Button
                disabled={builderQuestions.length === 0}
                onClick={() => startQuiz(builderQuiz)}
              >
                Take Quiz
              </Button>
            </div>
          }
        />

        {builderQuestions.length === 0 ? (
          <EmptyState
            icon={<span className="text-6xl">❓</span>}
            title="No questions yet"
            description="Add your first question to build this quiz."
            action={{ label: 'Add Question', onClick: openAddQuestionDialog }}
          />
        ) : (
          <div className="space-y-4">
            {builderQuestions.map((q, idx) => (
              <Card key={q.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Q{idx + 1}</span>
                        <Badge variant={q.type === 'multiple-choice' ? 'info' : q.type === 'true-false' ? 'default' : 'success'}>
                          {q.type === 'multiple-choice' ? 'MC' : q.type === 'true-false' ? 'T/F' : 'Short'}
                        </Badge>
                      </div>
                      <p className="text-gray-900 dark:text-white font-medium">{q.question}</p>
                      {q.type === 'short-answer' ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Answer: <span className="text-green-600 dark:text-green-400">{String(q.correctAnswer)}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Answer: <span className="text-green-600 dark:text-green-400">{q.type === 'true-false' ? (q.correctAnswer === 0 ? 'True' : 'False') : (q.options[q.correctAnswer as number] ?? 'N/A')}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditQuestionDialog(q)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteQuestionConfirmId(q.id)}>Delete</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {builderQuestions.length > 0 && (
          <div className="mt-6">
            <Button onClick={openAddQuestionDialog}>Add Question</Button>
          </div>
        )}

        {/* Add / Edit question dialog */}
        <Dialog
          isOpen={isQuestionDialogOpen}
          onClose={() => { setIsQuestionDialogOpen(false); setEditingQuestion(null); setQuestionForm(emptyQuestionForm); }}
          title={editingQuestion ? 'Edit Question' : 'Add Question'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Question Type</label>
              <div className="flex gap-2">
                {(['multiple-choice', 'true-false', 'short-answer'] as QuestionType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setQuestionForm((prev) => ({
                        ...prev,
                        type: t,
                        correctAnswer: t === 'short-answer' ? '' : 0,
                        options: t === 'multiple-choice' ? ['', '', '', ''] : prev.options,
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                      questionForm.type === t
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {t === 'multiple-choice' ? 'Multiple Choice' : t === 'true-false' ? 'True/False' : 'Short Answer'}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Question"
              value={questionForm.question}
              onChange={(e) => setQuestionForm({ ...questionForm, question: e.target.value })}
              placeholder="Enter your question..."
            />

            {questionForm.type === 'multiple-choice' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Options &amp; Correct Answer</label>
                {questionForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuestionForm({ ...questionForm, correctAnswer: i })}
                      className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                        questionForm.correctAnswer === i
                          ? 'border-green-600 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'
                      }`}
                      title="Mark as correct"
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...questionForm.options];
                        newOpts[i] = e.target.value;
                        setQuestionForm({ ...questionForm, options: newOpts });
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      className="flex-1"
                    />
                  </div>
                ))}
                <p className="text-xs text-gray-500 dark:text-gray-400">Click a letter to mark the correct answer (green = correct).</p>
              </div>
            )}

            {questionForm.type === 'true-false' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correct Answer</label>
                <div className="flex gap-3">
                  {[{ label: 'True', value: 0 }, { label: 'False', value: 1 }].map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setQuestionForm({ ...questionForm, correctAnswer: value })}
                      className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        questionForm.correctAnswer === value
                          ? 'border-green-600 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {questionForm.type === 'short-answer' && (
              <Input
                label="Correct Answer"
                value={typeof questionForm.correctAnswer === 'string' ? questionForm.correctAnswer : ''}
                onChange={(e) => setQuestionForm({ ...questionForm, correctAnswer: e.target.value })}
                placeholder="Enter the correct answer..."
              />
            )}

            <Input
              label="Explanation (optional)"
              value={questionForm.explanation}
              onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })}
              placeholder="Explain why this is the correct answer..."
            />

            <div className="flex gap-3 pt-2">
              <Button
                onClick={editingQuestion ? handleUpdateQuestion : handleAddQuestion}
                className="flex-1"
              >
                {editingQuestion ? 'Save Changes' : 'Add Question'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setIsQuestionDialogOpen(false); setEditingQuestion(null); setQuestionForm(emptyQuestionForm); }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Delete question confirm */}
        <Dialog
          isOpen={deleteQuestionConfirmId !== null}
          onClose={() => setDeleteQuestionConfirmId(null)}
          title="Delete Question?"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">This action cannot be undone.</p>
            <div className="flex gap-3">
              <Button
                variant="danger"
                onClick={() => deleteQuestionConfirmId && handleDeleteQuestion(deleteQuestionConfirmId)}
                className="flex-1"
              >
                Delete
              </Button>
              <Button variant="secondary" onClick={() => setDeleteQuestionConfirmId(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </Dialog>
      </DashboardLayout>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────

  return (
    <DashboardLayout>
      <PageHeader
        title="Quizzes"
        description="Create quizzes, test your knowledge, and track your progress"
        action={
          <Button onClick={() => { setQuizForm({ name: '', description: '', subjectId: subjects[0]?.id ?? '' }); setIsCreateDialogOpen(true); }}>
            New Quiz
          </Button>
        }
      />

      {quizzes.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">📝</span>}
          title="No quizzes yet"
          description="Create your first quiz to start testing your knowledge."
          action={{
            label: 'Create Quiz',
            onClick: () => { setQuizForm({ name: '', description: '', subjectId: subjects[0]?.id ?? '' }); setIsCreateDialogOpen(true); },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quizzes.map((quiz) => {
            const qCount = getQuestionCount(quiz.id);
            const latest = getLatestResult(quiz.id);
            const latestPct = latest && latest.totalQuestions > 0
              ? Math.round((latest.score / latest.totalQuestions) * 100)
              : null;

            return (
              <Card key={quiz.id} className="hover:shadow-md transition-shadow flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{quiz.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {getSubjectName(quiz.subjectId)}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(quiz)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteQuiz(quiz.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end">
                  <div className="space-y-3">
                    {quiz.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{quiz.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <span>{qCount} question{qCount !== 1 ? 's' : ''}</span>
                      {latestPct !== null && (
                        <Badge variant={latestPct >= 70 ? 'success' : latestPct >= 50 ? 'warning' : 'danger'}>
                          Last: {latestPct}%
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => openBuilder(quiz)}
                      >
                        Manage
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={qCount === 0}
                        onClick={() => startQuiz(quiz)}
                      >
                        Take Quiz
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create quiz dialog */}
      <Dialog isOpen={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} title="Create Quiz">
        <div className="space-y-4">
          <Input
            label="Quiz Name"
            value={quizForm.name}
            onChange={(e) => setQuizForm({ ...quizForm, name: e.target.value })}
            placeholder="e.g., Chapter 5 Review"
          />
          <Input
            label="Description (optional)"
            value={quizForm.description}
            onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
            placeholder="Brief description of the quiz..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
            {subjects.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Create a subject first before making a quiz.</p>
            ) : (
              <select
                value={quizForm.subjectId}
                onChange={(e) => setQuizForm({ ...quizForm, subjectId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleCreateQuiz} disabled={!quizForm.name.trim() || !quizForm.subjectId} className="flex-1">
              Create Quiz
            </Button>
            <Button variant="secondary" onClick={() => setIsCreateDialogOpen(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit quiz dialog */}
      <Dialog isOpen={isEditDialogOpen} onClose={() => setIsEditDialogOpen(false)} title="Edit Quiz">
        <div className="space-y-4">
          <Input
            label="Quiz Name"
            value={quizForm.name}
            onChange={(e) => setQuizForm({ ...quizForm, name: e.target.value })}
            placeholder="e.g., Chapter 5 Review"
          />
          <Input
            label="Description (optional)"
            value={quizForm.description}
            onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
            placeholder="Brief description of the quiz..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
            <select
              value={quizForm.subjectId}
              onChange={(e) => setQuizForm({ ...quizForm, subjectId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleUpdateQuiz} disabled={!quizForm.name.trim()} className="flex-1">
              Save Changes
            </Button>
            <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
