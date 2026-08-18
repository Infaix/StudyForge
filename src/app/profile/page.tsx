'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Badge,
  Progress,
} from '@/components/ui';
import { userProfileStorage, studySessionStorage, subjectStorage } from '@/lib/storage';
import { UserProfile, StudySession, Subject } from '@/types';

const ACHIEVEMENTS_MAP: Record<string, { title: string; icon: string; description: string }> = {
  first_session: { title: 'First Steps', icon: '🎓', description: 'Complete your first study session' },
  streak_3: { title: 'On Fire', icon: '🔥', description: 'Maintain a 3-day study streak' },
  streak_7: { title: 'Weekly Warrior', icon: '⚔️', description: 'Maintain a 7-day study streak' },
  streak_30: { title: 'Monthly Master', icon: '👑', description: 'Maintain a 30-day study streak' },
  sessions_10: { title: 'Dedicated Learner', icon: '📚', description: 'Complete 10 study sessions' },
  sessions_50: { title: 'Study Addict', icon: '🧪', description: 'Complete 50 study sessions' },
  sessions_100: { title: 'Century Club', icon: '💯', description: 'Complete 100 study sessions' },
  xp_1000: { title: 'XP Collector', icon: '⚡', description: 'Earn 1,000 XP' },
  xp_5000: { title: 'XP Hunter', icon: '🎯', description: 'Earn 5,000 XP' },
  xp_10000: { title: 'XP Legend', icon: '🌟', description: 'Earn 10,000 XP' },
  level_5: { title: 'Rising Star', icon: '⭐', description: 'Reach level 5' },
  level_10: { title: 'Scholar', icon: '🏅', description: 'Reach level 10' },
  level_25: { title: 'Grandmaster', icon: '🏆', description: 'Reach level 25' },
  subjects_3: { title: 'Multidisciplinary', icon: '🎨', description: 'Study 3 different subjects' },
  subjects_5: { title: 'Polymath', icon: '🧠', description: 'Study 5 different subjects' },
  time_60: { title: 'Hour of Power', icon: '⏱️', description: 'Study for 60 minutes total' },
  time_600: { title: 'Ten Hour Titan', icon: '🕐', description: 'Study for 600 minutes total' },
};

function formatStudyTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 512;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > size) {
            height = Math.round((height * size) / width);
            width = size;
          }
        } else {
          if (height > size) {
            width = Math.round((width * size) / height);
            height = size;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const xpForNextLevel = (profile?.level ?? 1) * 100;
  const xpProgress = profile ? (profile.xp % ((profile.level || 1) * 100)) : 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const loadProfile = async () => {
      try {
        const [storedProfile, storedSessions, storedSubjects] = await Promise.all([
          userProfileStorage.get('current-user'),
          studySessionStorage.getAll(),
          subjectStorage.getAll(),
        ]);

        if (storedProfile) {
          setProfile(storedProfile);
          setDisplayName(storedProfile.displayName || '');
          setUsername(storedProfile.username || '');
        }
        setSessions(storedSessions);
        setSubjects(storedSubjects);
      } catch (err) {
        console.error('Failed to load profile data:', err);
      }
    };

    loadProfile();
  }, [mounted, user, router]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image size must be under 2MB.');
      return;
    }

    setError(null);
    try {
      const compressed = await compressImage(file);
      setProfile((prev) => (prev ? { ...prev, avatarUrl: compressed } : prev));
    } catch {
      setError('Failed to process image.');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
  };

  const handleSave = async () => {
    if (!profile || !displayName.trim() || !username.trim()) return;

    setError(null);
    setIsSaving(true);

    try {
      const updated: UserProfile = {
        ...profile,
        displayName: displayName.trim(),
        username: username.trim(),
        updatedAt: new Date().toISOString(),
      };
      await userProfileStorage.update(updated);
      setProfile(updated);
      setEditing(false);
    } catch {
      setError('Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setUsername(profile.username || '');
    }
    setError(null);
    setEditing(false);
  };

  const getInitials = (): string => {
    const name = profile?.displayName || profile?.username || 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getSubjectsStudied = (): string[] => {
    const subjectIds = new Set(sessions.map((s) => s.subjectId));
    return subjects
      .filter((s) => subjectIds.has(s.id))
      .map((s) => s.name);
  };

  const totalSessions = sessions.length;

  if (!mounted || !user || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 dark:text-gray-400">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Profile
            </h2>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || !displayName.trim() || !username.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative group flex-shrink-0">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName || profile.username}
                  className="w-28 h-28 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center border-4 border-gray-200 dark:border-gray-700">
                  <span className="text-3xl font-bold text-blue-600 dark:text-blue-300">
                    {getInitials()}
                  </span>
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                aria-label="Change avatar"
              >
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {profile.avatarUrl && (
                <button
                  onClick={handleRemoveAvatar}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                  aria-label="Remove avatar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {error && (
                <p className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-red-500 whitespace-nowrap">
                  {error}
                </p>
              )}
            </div>

            <div className="flex-1 w-full space-y-4">
              {editing ? (
                <div className="space-y-3">
                  <Input
                    label="Display Name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                  />
                  <Input
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Your username"
                  />
                </div>
              ) : (
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {profile.displayName || profile.username}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    @{profile.username}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Member since {new Date(profile.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {profile.streak}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Day{profile.streak !== 1 ? 's' : ''} Streak
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatStudyTime(profile.studyTimeAllTime)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Total Study
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {totalSessions}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Sessions
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {getSubjectsStudied().length}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Subject{getSubjectsStudied().length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Level &amp; Experience
          </h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="info" className="text-sm px-3 py-1">
                  Level {profile.level}
                </Badge>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile.xp} XP
                </span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {xpProgress} / {xpForNextLevel} XP to next level
              </span>
            </div>
            <Progress value={xpProgress} max={xpForNextLevel} size="lg" />
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatStudyTime(profile.studyTimeToday)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Today</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatStudyTime(profile.studyTimeThisWeek)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">This Week</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatStudyTime(profile.studyTimeThisMonth)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">This Month</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {getSubjectsStudied().length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Subjects Studied
            </h2>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {getSubjectsStudied().map((name) => (
                <Badge key={name} variant="info">
                  {name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Achievements
          </h2>
        </CardHeader>
        <CardContent>
          {profile.achievements.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.achievements.map((achId) => {
                const ach = ACHIEVEMENTS_MAP[achId];
                return (
                  <div
                    key={achId}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <span className="text-2xl flex-shrink-0">
                      {ach?.icon ?? '🎖️'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {ach?.title ?? achId}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {ach?.description ?? 'Achievement'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400 dark:text-gray-500 text-sm">
                No achievements yet. Keep studying to unlock them!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Account
          </h2>
        </CardHeader>
        <CardContent>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to sign out?')) {
                signOut();
              }
            }}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
