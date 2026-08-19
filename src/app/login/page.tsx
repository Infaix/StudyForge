'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, Button, Input } from '@/components/ui';
import { userProfileStorage } from '@/lib/storage';
import type { UserProfile } from '@/types';
import { DEFAULT_PRIVACY_SETTINGS } from '@/types';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const existingProfile = await userProfileStorage.get('current-user');

      if (existingProfile && existingProfile.id) {
        window.location.href = '/dashboard';
        return;
      }

      const now = new Date().toISOString();
      const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      const username = email.trim().split('@')[0];
      const profile: UserProfile = {
        id: userId,
        username,
        displayName: username,
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
      await userProfileStorage.update({ ...profile, id: 'current-user' });
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Login failed:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md px-4">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-bold text-gray-900 dark:text-white">StudyForge</span>
        </Link>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
              Sign In
            </h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  {error}
                </p>
              )}

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Don&apos;t have an account?{' '}
              <Link
                href="/register"
                className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
