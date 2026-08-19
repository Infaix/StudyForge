'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthUser } from '@/types';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  hasSession: boolean;
  refreshUser: () => Promise<void>;
  signIn: (login: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, username: string, password: string, displayName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setHasSession(true);
          return;
        }
      }
      setUser(null);
      setHasSession(false);
    } catch {
      setUser(null);
      setHasSession(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    refreshUser().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => { mounted = false };
  }, [refreshUser]);

  const signIn = useCallback(async (login: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Login failed' };
      await refreshUser();
      return {};
    } catch {
      return { error: 'Network error' };
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  const signUp = useCallback(async (email: string, username: string, password: string, displayName?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, username, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Registration failed' };
      await refreshUser();
      return {};
    } catch {
      return { error: 'Network error' };
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
      setHasSession(false);
      window.location.href = '/login';
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, hasSession, refreshUser, signIn, signUp, signOut, updateUser }}>
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
