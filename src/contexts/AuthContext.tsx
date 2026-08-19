'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

import { AuthUser, DEFAULT_PRIVACY_SETTINGS } from '@/types';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  hasSession: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        // Check if we have a stored session in IndexedDB
        const profile = await (await import('@/lib/storage')).userProfileStorage.get('current-user');
        if (profile && profile.id) {
          setUser({
            id: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            bio: profile.bio ?? '',
            xp: profile.xp ?? 0,
            level: profile.level ?? 1,
            streak: profile.streak ?? 0,
            studyTimeToday: profile.studyTimeToday ?? 0,
            studyTimeThisWeek: profile.studyTimeThisWeek ?? 0,
            studyTimeThisMonth: profile.studyTimeThisMonth ?? 0,
            studyTimeAllTime: profile.studyTimeAllTime ?? 0,
            friends: profile.friends ?? [],
            friendRequestsReceived: profile.friendRequestsReceived ?? [],
            friendRequestsSent: profile.friendRequestsSent ?? [],
            groups: profile.groups ?? [],
            achievements: profile.achievements ?? [],
            privacy: profile.privacy ?? DEFAULT_PRIVACY_SETTINGS,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          });
          setHasSession(true);
        }
      } catch (error) {
        console.error('Failed to load auth session:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadSession();

    return () => { mounted = false };
  }, []);

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      // Redirect to Google OAuth page
      window.location.href = '/api/auth/google/callback';
    } catch (error) {
      console.error('Google sign in failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      // Clear the current user from IndexedDB
      await (await import('@/lib/storage')).userProfileStorage.delete('current-user');
      setUser(null);
      setHasSession(false);
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithGoogle, signOut, hasSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a AuthProvider');
  }
  return context;
}