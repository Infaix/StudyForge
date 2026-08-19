'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, Button, Input } from '@/components/ui';
import { DEFAULT_PRIVACY_SETTINGS } from '@/types';

function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

function validateUsername(u: string): string | null {
  if (u.length < 3) return 'Username must be at least 3 characters';
  if (u.length > 20) return 'Username must be at most 20 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return 'Username can only contain letters, numbers, and underscores';
  return null;
}

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const trimmedUsername = username.trim();
      const trimmedName = name.trim();
      if (!trimmedUsername) {
        setError('Username is required');
        return;
      }

      const validationError = validateUsername(trimmedUsername);
      if (validationError) {
        setError(validationError);
        return;
      }

      const { userProfileStorage } = await import('@/lib/storage');
      const existing = await userProfileStorage.getByUsername(trimmedUsername);
      if (existing && existing.id) {
        setError('Username already taken. Please choose another.');
        return;
      }

      const userId = generateUserId();
      const now = new Date().toISOString();
      const profile = {
        id: userId,
        username: trimmedUsername,
        displayName: trimmedName || trimmedUsername,
        avatarUrl: null,
        bio: '',
        xp: 0,
        level: 1,
        streak: 0,
        studyTimeToday: 0,
        studyTimeThisWeek: 0,
        studyTimeThisMonth: 0,
        studyTimeAllTime: 0,
        friends: [],
        friendRequestsReceived: [],
        friendRequestsSent: [],
        groups: [],
        achievements: [],
        privacy: { ...DEFAULT_PRIVACY_SETTINGS },
        createdAt: now,
        updatedAt: now,
      };
      await userProfileStorage.create(profile);

      await userProfileStorage.update({
        ...profile,
        id: 'current-user',
      });

      router.push('/dashboard');
    } catch (err) {
      console.error('Registration failed:', err);
      setError('Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white rounded-xl p-8 max-w-md w-full dark:bg-gray-800 shadow-lg">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Register</h2>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Create an account to start tracking your study progress.
            </p>
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
              )}
              <Input
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Alex Johnson"
              />
              <Input
                label="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
              />
              <Button type="submit" className="w-full">
                Create Account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}