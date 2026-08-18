'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button, Card, CardContent, CardHeader, Input, EmptyState, PageHeader, Badge } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { subjectStorage, topicStorage, studySessionStorage, userProfileStorage, xpTransactionStorage, userAchievementStorage } from '@/lib/storage';
import { Subject, Topic, UserProfile, XpTransaction } from '@/types';
import { AchievementCatalog } from '@/components/achievements';

type TimerMode = 'pomodoro' | 'shortBreak' | 'longBreak' | 'custom';

const TIMER_DURATIONS: Record<TimerMode, number> = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  custom: 0,
};

const MODE_LABELS: Record<TimerMode, string> = {
  pomodoro: 'Pomodoro',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
  custom: 'Custom',
};

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch {}
}

export default function FocusPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  if (!user) {
    signOut();
    router.push('/login');
    return null;
  }

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(30);
  const [totalSeconds, setTotalSeconds] = useState(TIMER_DURATIONS.pomodoro);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMER_DURATIONS.pomodoro);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [showSetup, setShowSetup] = useState(true);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [userXp, setUserXp] = useState(0);
  const [alreadyUnlocked, setAlreadyUnlocked] = useState<string[]>([]);

  useEffect(() => {
    subjectStorage.getAll().then(setSubjects);
    userProfileStorage.get(user.id).then((profile) => {
      if (profile) {
        setUserXp(profile.xp);
        setUserLevel(profile.level);
        setAlreadyUnlocked(profile.achievements || []);
      }
    });
  }, [user]);

  const calculateLevel = (xp: number): number => {
    return Math.max(1, Math.floor(xp / 100) + 1);
  };

  // Achievement catalog
  const AchievementCatalog = {
    first_session: {
      id: 'first_session',
      title: 'First Steps',
      description: 'Complete your first study session',
      icon: '🎯',
      category: 'getting-started',
      requirement: 'complete_1_session',
      rewardXp: 50,
    },
    five_sessions: {
      id: 'five_sessions',
      title: 'Getting Started',
      description: 'Complete 5 study sessions',
      icon: '📚',
      category: 'getting-started',
      requirement: 'complete_5_sessions',
      rewardXp: 150,
    },
    hundred_xp: {
      id: 'hundred_xp',
      title: 'XP Beginner',
      description: 'Earn 100 XP',
      icon: '⭐',
      category: 'progress',
      requirement: 'earn_100_xp',
      rewardXp: 100,
    },
    first_week: {
      id: 'first_week',
      title: 'Week Warrior',
      description: 'Study for 7 days in a row',
      icon: '🔥',
      category: 'streak',
      requirement: 'streak_7_days',
      rewardXp: 200,
    },
    level_5: {
      id: 'level_5',
      title: 'Rising Star',
      description: 'Reach level 5',
      icon: '✨',
      category: 'level',
      requirement: 'level_5',
      rewardXp: 300,
    },
  } as const;

  const handleTimerComplete = useCallback(async () => {
    if (timerMode === 'pomodoro') {
      const now = new Date();
      const start = new Date(now.getTime() - totalSeconds * 1000);
      const durationMinutes = Math.round(totalSeconds / 60);

      // Award XP for study session (10 XP per minute, minimum 10 XP)
      const xpAward = Math.max(10, durationMinutes * 10);

      // Create study session
      await studySessionStorage.create({
        id: crypto.randomUUID(),
        subjectId: selectedSubjectId,
        topicId: selectedTopicId || null,
        duration: durationMinutes,
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        notes: null,
      });

      // Create XP transaction
      await xpTransactionStorage.create({
        id: crypto.randomUUID(),
        userId: user.id,
        amount: xpAward,
        reason: 'study_session',
        relatedId: null,
        createdAt: now.toISOString(),
      });

      // Update user profile with new XP and study time
      await userProfileStorage.get(user.id).then(async (profile) => {
        if (profile) {
          const newXp = profile.xp + xpAward;
          const newStudyTime = (profile.studyTimeToday || 0) + totalSeconds;
          const newStudyTimeWeek = (profile.studyTimeThisWeek || 0) + totalSeconds;
          const newStudyTimeMonth = (profile.studyTimeThisMonth || 0) + totalSeconds;
          const newStudyTimeAllTime = (profile.studyTimeAllTime || 0) + totalSeconds;
          const newLevel = calculateLevel(newXp);

          // Check and award achievements
          const newlyUnlocked: string[] = [];

          // Check first session achievement
          if (!alreadyUnlocked.includes(AchievementCatalog.first_session.id)) {
            const sessionCount = alreadyUnlocked.length;
            if (sessionCount === 0) {
              await userAchievementStorage.create({
                id: crypto.randomUUID(),
                userId: user.id,
                achievementId: AchievementCatalog.first_session.id,
                unlockedAt: new Date().toISOString(),
              });
              newlyUnlocked.push(AchievementCatalog.first_session.id);
            }
          }

          // Check 5 sessions achievement
          if (sessionCount >= 5 && !alreadyUnlocked.includes(AchievementCatalog.five_sessions.id)) {
            await userAchievementStorage.create({
              id: crypto.randomUUID(),
              userId: user.id,
              achievementId: AchievementCatalog.five_sessions.id,
              unlockedAt: new Date().toISOString(),
            });
            newlyUnlocked.push(AchievementCatalog.five_sessions.id);
          }

          // Check 100 XP achievement
          if (newXp >= 100 && !alreadyUnlocked.includes(AchievementCatalog.hundred_xp.id)) {
            await userAchievementStorage.create({
              id: crypto.randomUUID(),
              userId: user.id,
              achievementId: AchievementCatalog.hundred_xp.id,
              unlockedAt: new Date().toISOString(),
            });
            newlyUnlocked.push(AchievementCatalog.hundred_xp.id);
          }

          const updatedProfile: UserProfile = {
            ...profile,
            xp: newXp,
            level: newLevel,
            studyTimeToday: newStudyTime,
            studyTimeThisWeek: newStudyTimeWeek,
            studyTimeThisMonth: newStudyTimeMonth,
            studyTimeAllTime: newStudyTimeAllTime,
            achievements: [...profile.achievements, ...newlyUnlocked],
            updatedAt: new Date().toISOString(),
          };

          await userProfileStorage.update(updatedProfile);

          // Update local state
          setUserXp(newXp);
          setUserLevel(newLevel);
          setAlreadyUnlocked([...alreadyUnlocked, ...newlyUnlocked]);
        }
      });

      setCompletedSessions((p) => p + 1);
      setPomodoroCount((p) => p + 1);
    }
  }, [timerMode, totalSeconds, selectedSubjectId, selectedTopicId, user, studySessionStorage, xpTransactionStorage, userProfileStorage, userAchievementStorage, alreadyUnlocked, calculateLevel, AchievementCatalog]);

  const tick = useCallback(() => {
    if (!endTimeRef.current) return;
    const now = Date.now();
    const left = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
    setRemainingSeconds(left);
    if (left <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      endTimeRef.current = null;
      setIsRunning(false);
      setIsPaused(false);
      playBeep();
      handleTimerComplete();
    }
  }, [handleTimerComplete]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startTimer = (seconds: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setIsRunning(true);
    setIsPaused(false);
    endTimeRef.current = Date.now() + seconds * 1000;
    intervalRef.current = setInterval(tick, 250);
  };

  const handleStart = () => {
    if (!selectedSubjectId) return;
    const duration = timerMode === 'custom' ? customMinutes * 60 : TIMER_DURATIONS[timerMode];
    setShowSetup(false);
    startTimer(duration);
  };

  const handlePause = () => {
    if (!isRunning || isPaused) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    pausedRemainingRef.current = remainingSeconds;
    endTimeRef.current = null;
    setIsPaused(true);
  };

  const handleResume = () => {
    if (!isPaused) return;
    endTimeRef.current = Date.now() + pausedRemainingRef.current * 1000;
    intervalRef.current = setInterval(tick, 250);
    setIsPaused(false);
  };

  const handleReset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    endTimeRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
    setShowSetup(true);
    const duration = timerMode === 'custom' ? customMinutes * 60 : TIMER_DURATIONS[timerMode];
    setRemainingSeconds(duration);
    setTotalSeconds(duration);
  };

  const handleModeChange = (mode: TimerMode) => {
    if (isRunning) return;
    setTimerMode(mode);
    const duration = mode === 'custom' ? customMinutes * 60 : TIMER_DURATIONS[mode];
    setTotalSeconds(duration);
    setRemainingSeconds(duration);
  };

  const handleCustomChange = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0 && n <= 180) {
      setCustomMinutes(n);
      if (timerMode === 'custom') {
        setTotalSeconds(n * 60);
        setRemainingSeconds(n * 60);
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  const getLongBreakEvery = () => {
    return pomodoroCount > 0 && pomodoroCount % 4 === 0;
  };

  const progressColor =
    timerMode === 'pomodoro'
      ? 'bg-blue-600'
      : timerMode === 'shortBreak'
        ? 'bg-green-500'
        : timerMode === 'longBreak'
          ? 'bg-purple-500'
          : 'bg-amber-500';

  const ringColor =
    timerMode === 'pomodoro'
      ? 'stroke-blue-600'
      : timerMode === 'shortBreak'
        ? 'stroke-green-500'
        : timerMode === 'longBreak'
          ? 'stroke-purple-500'
          : 'stroke-amber-500';

  if (subjects.length === 0) {
    return (
      <DashboardLayout>
        <PageHeader title="Focus" description="Stay focused with Pomodoro timers and concentration tools" />
        <EmptyState
          icon={<span className="text-6xl">🎯</span>}
          title="No subjects yet"
          description="Create a subject first to start tracking your focus sessions."
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Focus"
        description="Stay focused with Pomodoro timers and concentration tools"
        action={
          completedSessions > 0 ? (
            <Badge variant="success">
              {completedSessions} session{completedSessions !== 1 ? 's' : ''} completed
            </Badge>
          ) : undefined
        }
      />
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Lvl {userLevel}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {userXp} XP
        </span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="flex flex-col items-center py-10">
              {!showSetup && selectedSubject && (
                <div className="mb-6 flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedSubject.colour }}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedSubject.name}
                  </span>
                  {selectedTopicId && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      — {topics.find((t) => t.id === selectedTopicId)?.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative w-64 h-64 mb-8">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 256 256">
                  <circle
                    cx="128"
                    cy="128"
                    r="112"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-gray-200 dark:text-gray-700"
                  />
                  <circle
                    cx="128"
                    cy="128"
                    r="112"
                    fill="none"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 112}
                    strokeDashoffset={2 * Math.PI * 112 * (1 - progressPercent / 100)}
                    className={`${ringColor} transition-[stroke-dashoffset] duration-300 ease-out`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-mono font-bold text-gray-900 dark:text-white">
                    {formatTime(remainingSeconds)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {MODE_LABELS[timerMode]}
                  </span>
                </div>
              </div>

              {showSetup ? (
                <div className="w-full max-w-sm space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Timer Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(MODE_LABELS) as TimerMode[]).map((mode) => (
                        <Button
                          key={mode}
                          variant={timerMode === mode ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => handleModeChange(mode)}
                        >
                          {MODE_LABELS[mode]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {timerMode === 'custom' && (
                    <Input
                      label="Minutes"
                      type="number"
                      min={1}
                      max={180}
                      value={customMinutes}
                      onChange={(e) => handleCustomChange(e.target.value)}
                    />
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Subject
                    </label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="">Select a subject</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.icon} {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSubjectId && topics.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Topic (optional)
                      </label>
                      <select
                        value={selectedTopicId}
                        onChange={(e) => setSelectedTopicId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        <option value="">No specific topic</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!selectedSubjectId}
                    onClick={handleStart}
                  >
                    Start {MODE_LABELS[timerMode]}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {!isRunning && (
                    <Button size="lg" onClick={handleStart}>
                      Start
                    </Button>
                  )}
                  {isRunning && !isPaused && (
                    <Button size="lg" variant="secondary" onClick={handlePause}>
                      Pause
                    </Button>
                  )}
                  {isPaused && (
                    <Button size="lg" onClick={handleResume}>
                      Resume
                    </Button>
                  )}
                  {(isRunning || isPaused) && (
                    <Button size="lg" variant="ghost" onClick={handleReset}>
                      Reset
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sessions</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Pomodoros completed</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{completedSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total focus time</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {Math.round((completedSessions * (totalSeconds / 60)))} min
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-2 rounded-full ${
                        i < pomodoroCount % 4 || (pomodoroCount > 0 && pomodoroCount % 4 === 0 && i < 4)
                          ? progressColor
                          : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getLongBreakEvery() ? 'Long break next!' : `Next long break in ${4 - (pomodoroCount % 4)} pomodor${4 - (pomodoroCount % 4) === 1 ? 'o' : 'o'}s`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Progress</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="w-full bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700 h-3">
                  <div
                    className={`h-full transition-all duration-300 ease-out rounded-full ${progressColor}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>{formatTime(totalSeconds - remainingSeconds)} elapsed</span>
                  <span>{formatTime(remainingSeconds)} remaining</span>
                </div>
              </div>
            </CardContent>
          </Card>