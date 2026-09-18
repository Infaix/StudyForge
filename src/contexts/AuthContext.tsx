'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AuthUser, StudyGoal } from '@/types';
import { refreshUserStats as fetchStudyStats, StudyStats } from '@/lib/client/studySubmission';
import { migrateAnonymousGoals } from '@/lib/client/goalStore';
import { devLog } from '@/lib/client/devLog';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  hasSession: boolean;
  /**
   * Monotonic counter bumped whenever authoritative study statistics change
   * (segment ack or explicit refresh). Data-heavy pages watch this to refetch.
   */
  statsRevision: number;
  refreshUser: () => Promise<boolean>;
  /**
   * THE shared statistics refresh (reads /api/study/stats and applies the
   * D1-backed values to the shared auth/profile state). Read-only — it can
   * never create study records.
   */
  refreshUserStats: () => Promise<StudyStats | null>;
  /** Apply an authoritative StudyStats payload (e.g. a segment ack response). */
  applyStudyStats: (stats: StudyStats) => void;
  /** Signal that persisted stats changed so mounted pages can refetch. */
  notifyStatsChanged: () => void;
  signIn: (login: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, username: string, password: string, displayName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Map the authoritative stats payload onto the shared user object. */
function mergeStudyStats(user: AuthUser, s: StudyStats): AuthUser {
  return {
    ...user,
    xp: s.totalXp,
    level: s.level,
    streak: s.streak,
    studyTimeToday: Math.floor(s.todayStudySeconds / 60),
    studyTimeThisWeek: Math.floor(s.weekStudySeconds / 60),
    studyTimeThisMonth: Math.floor(s.monthStudySeconds / 60),
    studyTimeAllTime: Math.floor(s.totalStudySeconds / 60),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [statsRevision, setStatsRevision] = useState(0);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setHasSession(true);
          return true;
        }
      }
      setUser(null);
      setHasSession(false);
    } catch {
      setUser(null);
      setHasSession(false);
    }
    return false;
  }, []);

  useEffect(() => {
    let mounted = true;
    refreshUser().finally(() => {
      if (mounted) {
        setIsLoading(false);
        setIsInitializing(false);
      }
    });
    return () => { mounted = false };
  }, [refreshUser]);

  const notifyStatsChanged = useCallback(() => {
    setStatsRevision((r) => r + 1);
  }, []);

  const applyStudyStats = useCallback((s: StudyStats) => {
    setUser((prev) => (prev ? mergeStudyStats(prev, s) : prev));
    setStatsRevision((r) => r + 1);
    devLog('stats state updated', { totalXp: s.totalXp, level: s.level, totalStudySeconds: s.totalStudySeconds });
  }, []);

  const refreshUserStats = useCallback(async (): Promise<StudyStats | null> => {
    const s = await fetchStudyStats();
    if (!s) return null;
    devLog('authoritative stats received', { totalXp: s.totalXp, totalStudySeconds: s.totalStudySeconds });
    setUser((prev) => (prev ? mergeStudyStats(prev, s) : prev));
    setStatsRevision((r) => r + 1);
    devLog('stats state updated', { revisionSource: 'refreshUserStats' });
    return s;
  }, []);

  /**
   * Best-effort upload of any anonymous study goals into the account after
   * sign-in. Never blocks auth; duplicates are idempotently resolved by the
   * server's unique-index rejection.
   */
  const migrateGoalsAfterAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/goals?tz=UTC', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!data?.success) return;
      const serverGoals: StudyGoal[] = (data.progress ?? []).map(
        (p: { goal: StudyGoal }) => p.goal
      );
      await migrateAnonymousGoals(serverGoals);
    } catch {}
  }, []);

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
      if (!await refreshUser()) {
        return { error: 'Your session could not be confirmed. Please try signing in again.' };
      }
      void migrateGoalsAfterAuth();
      return {};
    } catch {
      return { error: 'Network error' };
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser, migrateGoalsAfterAuth]);

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
      if (!await refreshUser()) {
        return { error: 'Your account was created, but your session could not be confirmed. Please sign in.' };
      }
      void migrateGoalsAfterAuth();
      return {};
    } catch {
      return { error: 'Network error' };
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser, migrateGoalsAfterAuth]);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      // Persist any open study run BEFORE the session cookie disappears.
      // The durable queue survives regardless, but flushing first keeps the
      // current 20s checkpoint window attributed to this account (#5).
      try {
        await (window as unknown as { __studyforgeFlushAll?: () => Promise<void> }).__studyforgeFlushAll?.();
      } catch {
        // Best-effort: pagehide/queue recovery covers the remainder.
      }
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Sign out failed. Please try again.');
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

  // Only gate the initial identity lookup. Gating mutations unmounts the
  // calling form, discarding credentials and errors before the request ends.
  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, hasSession, statsRevision, refreshUser, refreshUserStats, applyStudyStats, notifyStatsChanged, signIn, signUp, signOut, updateUser }}>
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

/**
 * Keeps a mounted page in sync with authoritative data across page-lifecycle
 * events that do NOT remount it:
 * - tab/window becoming visible again,
 * - bfcache restore via back/forward navigation (pageshow.persisted),
 * - connectivity returning.
 * Callers pass their loader; `statsRevision` changes are handled separately
 * by adding it to the loader's effect dependencies.
 */
export function useLivePageRefresh(callback: () => void): void {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        devLog('page visible — refreshing page data');
        cbRef.current();
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        devLog('bfcache restore — refreshing page data');
        cbRef.current();
      }
    };
    const onOnline = () => {
      devLog('back online — refreshing page data');
      cbRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
