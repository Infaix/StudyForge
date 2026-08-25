'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, EmptyState, Badge, Button, Progress } from '@/components/ui';
import {
  subjectStorage,
  topicStorage,
  assessmentStorage,
  studySessionStorage,
  studyTaskStorage,
} from '@/lib/storage';
import { Subject, Topic, Assessment, StudySession, StudyTask, sessionSeconds } from '@/types';
import { useAuth, useLivePageRefresh } from '@/contexts/AuthContext';
import { getStudyRecommendation, type StudyRecommendation } from '@/lib/study/recommendations';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function calculateStreak(sessions: StudySession[]): number {
  if (sessions.length === 0) return 0;
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
  let streak = 0;
  let current = new Date();
  current.setHours(0, 0, 0, 0);
  for (const session of sorted) {
    const d = new Date(session.startTime);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((current.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === streak) {
      streak++;
      current = d;
    } else if (diff > streak) {
      break;
    }
  }
  return streak;
}

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700 ${className}`}
    />
  );
}

function LoadingSkeleton() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        <SkeletonCard className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} className="h-28" />
          ))}
        </div>
        <SkeletonCard className="h-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { statsRevision } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = React.useCallback(async () => {
    try {
      const [s, t, a, ss, st] = await Promise.all([
        subjectStorage.getAll(),
        topicStorage.getAll(),
        assessmentStorage.getAll(),
        studySessionStorage.getAll(),
        studyTaskStorage.getAll(),
      ]);
      setSubjects(s);
      setTopics(t);
      setAssessments(a);
      setStudySessions(ss);
      setTasks(st);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch authoritative data on mount, whenever persisted stats change
  // (e.g. a timer ack elsewhere), on tab return / bfcache restore / reconnect.
  useEffect(() => {
    loadData();
  }, [loadData, statsRevision]);
  useLivePageRefresh(loadData);

  const streak = useMemo(() => calculateStreak(studySessions), [studySessions]);

  const totalStudyMinutes = useMemo(
    () => Math.round(studySessions.reduce((sum, s) => sum + sessionSeconds(s), 0) / 60),
    [studySessions],
  );

  const overallMastery = useMemo(() => {
    if (topics.length === 0) return 0;
    return Math.round(topics.reduce((sum, t) => sum + t.mastery, 0) / topics.length);
  }, [topics]);

  const upcomingAssessments = useMemo(
    () =>
      assessments
        .filter((a) => a.status === 'upcoming' && new Date(a.date) >= new Date())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3),
    [assessments],
  );

  const allUpcomingCount = useMemo(
    () =>
      assessments.filter((a) => a.status === 'upcoming' && new Date(a.date) >= new Date())
        .length,
    [assessments],
  );

  const todaysTasks = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return tasks
      .filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) <= today)
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }, [tasks]);

  const recommendation: StudyRecommendation | null = useMemo(
    () =>
      getStudyRecommendation({
        subjects,
        topics,
        assessments,
        studySessions,
      }),
    [subjects, topics, assessments, studySessions],
  );

  const subjectProgress = useMemo(() => {
    return subjects.map((subject) => {
      const subjectTopics = topics.filter((t) => t.subjectId === subject.id);
      const avgMastery =
        subjectTopics.length > 0
          ? Math.round(subjectTopics.reduce((sum, t) => sum + t.mastery, 0) / subjectTopics.length)
          : 0;
      return { ...subject, topicCount: subjectTopics.length, avgMastery };
    });
  }, [subjects, topics]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Here&apos;s your study overview.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Study Streak
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {streak}
                <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-1">
                  {streak === 1 ? 'day' : 'days'}
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total Study Time
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {formatDuration(totalStudyMinutes)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Overall Mastery
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {overallMastery}
                <span className="text-lg font-normal text-gray-500 dark:text-gray-400">%</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Upcoming Assessments
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {allUpcomingCount}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Study Next
            </h2>
          </CardHeader>
          <CardContent>
            {recommendation ? (
              <div
                className="rounded-xl border p-6 dark:border-gray-700"
                style={{
                  backgroundColor: `${recommendation.subjectColour}10`,
                  borderColor: `${recommendation.subjectColour}40`,
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl"
                    style={{ backgroundColor: `${recommendation.subjectColour}20` }}
                  >
                    {recommendation.subjectIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {recommendation.topicName ?? recommendation.subjectName}
                      </h3>
                      <Badge
                        variant={
                          recommendation.priority === 'high'
                            ? 'danger'
                            : recommendation.priority === 'medium'
                              ? 'warning'
                              : 'default'
                        }
                      >
                        {recommendation.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {recommendation.subjectName}
                      {recommendation.topicName ? ` — ${recommendation.topicName}` : ''}
                    </p>
                    {recommendation.reasons.length > 0 && (
                      <ul className="mb-4 space-y-1">
                        {recommendation.reasons.map((reason, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                          >
                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Suggested session: {recommendation.suggestedMinutes} min
                      </span>
                      <Button size="sm" onClick={() => router.push('/focus')}>
                        Start Session
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<span className="text-5xl">💡</span>}
                title="No recommendation yet"
                description={
                  subjects.length === 0
                    ? 'Add your first subject to get started with personalised study recommendations.'
                    : topics.length === 0
                      ? 'Add topics to your subjects so StudyForge can recommend what to study next.'
                      : 'Add assessments or complete study sessions to let StudyForge prioritise your study.'
                }
                action={{
                  label: subjects.length === 0 ? 'Add Subject' : 'View Subjects',
                  onClick: () => router.push('/subjects'),
                }}
              />
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Upcoming Assessments
                </h2>
                {allUpcomingCount > 3 && (
                  <Button variant="ghost" size="sm" onClick={() => router.push('/assessments')}>
                    View all
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {upcomingAssessments.length > 0 ? (
                <div className="space-y-3">
                  {upcomingAssessments.map((assessment) => {
                    const subject = subjects.find((s) => s.id === assessment.subjectId);
                    const days = daysUntil(assessment.date);
                    return (
                      <div
                        key={assessment.id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {subject && (
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm"
                              style={{ backgroundColor: `${subject.colour}20` }}
                            >
                              {subject.icon}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {assessment.name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {subject?.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge
                            variant={days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'info'}
                          >
                            {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<span className="text-4xl">📝</span>}
                  title="No upcoming assessments"
                  description="Add an upcoming assessment to help prioritise your study."
                  action={{
                    label: 'Add Assessment',
                    onClick: () => router.push('/assessments'),
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Today&apos;s Tasks
                </h2>
                {todaysTasks.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => router.push('/planner')}>
                    View all
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {todaysTasks.length > 0 ? (
                <div className="space-y-3">
                  {todaysTasks.slice(0, 5).map((task) => {
                    const subject = subjects.find((s) => s.id === task.subjectId);
                    const isOverdue = task.dueDate && daysUntil(task.dueDate) < 0;
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {subject && (
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm"
                              style={{ backgroundColor: `${subject.colour}20` }}
                            >
                              {subject.icon}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {task.title}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {subject?.name}
                              {isOverdue && (
                                <span className="ml-1 text-red-600 dark:text-red-400">
                                  · Overdue
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            task.priority === 'high'
                              ? 'danger'
                              : task.priority === 'medium'
                                ? 'warning'
                                : 'default'
                          }
                        >
                          {task.priority}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<span className="text-4xl">✅</span>}
                  title="No tasks due"
                  description="Create a study task to plan your sessions."
                  action={{
                    label: 'Go to Planner',
                    onClick: () => router.push('/planner'),
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {subjectProgress.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Subject Progress
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {subjectProgress.map((subject) => (
                  <div key={subject.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{subject.icon}</span>
                        <span className="font-medium text-gray-900 dark:text-white truncate">
                          {subject.name}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {subject.topicCount} {subject.topicCount === 1 ? 'topic' : 'topics'}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                        {subject.avgMastery}%
                      </span>
                    </div>
                    <Progress value={subject.avgMastery} size="sm" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
