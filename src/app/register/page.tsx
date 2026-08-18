'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, Button, Input, Badge } from '@/components/ui';

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
      if (!trimmedUsername) {
        setError('Username is required');
        return;
      }

      const { userProfileStorage } = await import('@/lib/storage');
      // Check if username already exists
      const existing = await userProfileStorage.getByUsername(trimmedUsername);
      if (existing && existing.id) {
        setError('Username already taken. Please choose another.');
        return;
      }

      const profile: any = {
        id: 'user-' + Date.now(),
        username: trimmedUsername,
        displayName: name || trimmedUsername,
        avatarUrl: null,
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await userProfileStorage.create(profile);

      // Store as current user
      await userProfileStorage.update({
        ...profile,
        id: 'current-user',
      });

      router.push('/dashboard');
    } catch (error) {
      console.error('Registration failed:', error);
      setError('Registration failed. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="bg-white rounded-xl p-8 max-w-md w-full dark:bg-gray-800 shadow-lg">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Register</h2>
            </CardHeader>
            <CardContent>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
              )}
              <form onSubmit={handleRegister} className="space-y-4">
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