'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  StudySessionClient,
  StudyStats,
  SegmentAck,
  StudyMode,
  MIN_SUBMIT_SECONDS,
  flushPendingSegments,
  getPendingSegments,
  startPendingFlush,
  enqueuePendingSegment,
} from './studySubmission';
import { devLog } from './devLog';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'offline';

/**
 * Centralised study-time persistence for ALL timer modes (spec #26).
 *
 * Timer pages own display mechanics (clock faces, phase machines); this hook
 * owns every persistence concern so there is exactly one implementation:
 *
 * - One StudySessionClient per timer session -> unique segmentIds (#7).
 * - Race-safe flush: concurrent triggers (pause / visibilitychange /
 *   checkpoint) share one in-flight flush instead of double-submitting (#25).
 * - Periodic checkpoints (~20s) submit ONLY newly accumulated seconds (#10).
 * - Pause/stop/completion flush immediately (#6).
 * - Refresh recovery: a run orphaned by reload is reconciled under a
 *   DETERMINISTIC segmentId (`#p-<epochSecond>`), so pagehide-enqueue and
 *   reload-recovery collapse into one server record — never duplicated (#8).
 * - Offline failures land in a durable queue that retries automatically
 *   (#23/#24) while the timer keeps running.
 * - Every ack applies the SERVER's authoritative stats to the auth context,
 *   so header XP, dashboards, profile and leaderboards stay synchronised
 *   without logout/login (#16).
 */

const ACTIVE_TIMER_KEY = 'studyforge-active-timer';
export const CHECKPOINT_INTERVAL_MS = 20_000;
/** Minimum run length before a checkpoint will cut a segment. */
const CHECKPOINT_MIN_SECONDS = 10;

interface ActiveTimerSnapshot {
  sessionId: string;
  mode: StudyMode;
  subjectId: string | null;
  subjectName: string | null;
  /** Seconds acknowledged by the server within this timer session. */
  recordedSeconds: number;
  /** Epoch ms of the currently open measurement run (null when none). */
  runStartedAt: number | null;
  segStartIso: string | null;
  paused: boolean;
  savedAt: number;
}

function deterministicOrphanId(sessionId: string, runStartedAtMs: number): string {
  return `${sessionId}#p-${Math.floor(runStartedAtMs / 1000)}`;
}

function loadSnapshot(): ActiveTimerSnapshot | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(ACTIVE_TIMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTimerSnapshot;
    return parsed && typeof parsed.sessionId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot: ActiveTimerSnapshot | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (!snapshot) window.localStorage.removeItem(ACTIVE_TIMER_KEY);
    else window.localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(snapshot));
  } catch {}
}

export interface UseStudyTimeSyncOptions {
  mode: StudyMode;
  getSubject: () => { id?: string; name?: string | null };
}

export function useStudyTimeSync({ mode, getSubject }: UseStudyTimeSyncOptions) {
  const { user, applyStudyStats, refreshUserStats: ctxRefreshStats } = useAuth();

  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [lastAward, setLastAward] = useState<{ seconds: number; xp: number; id: number } | null>(null);
  const [stats, setStats] = useState<StudyStats | null>(null);
  /** True once the first authoritative stats read has COMPLETED (success or
   * failure). UIs use this to show a real loading indicator only while a
   * load is genuinely in flight, never as a permanent '…'. */
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [syncing, setSyncing] = useState(0);
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  );
  const [queuedCount, setQueuedCount] = useState(0);

  // Mirrors of state usable inside callbacks without stale closures.
  const recordedRef = useRef(0);
  const pendingRef = useRef(0);

  const sessionClientRef = useRef<StudySessionClient | null>(null);
  const runStartRef = useRef<number | null>(null);
  const segStartRef = useRef<string>('');
  /**
   * Sub-minimum seconds held back from the last pause. They ride along with
   * the next submitted segment, so short bursts are never silently lost
   * (spec #12) while still respecting the server's minimum segment size.
   */
  const carriedSecondsRef = useRef(0);
  /** True while the timer page considers itself "running" across pauses. */
  const wantOpenRef = useRef(false);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const inflightCountRef = useRef(0);
  const awardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTotalsRef = useRef({ seconds: 0, xp: 0 });
  const subjectGetterRef = useRef(getSubject);
  useEffect(() => {
    subjectGetterRef.current = getSubject;
  });

  const status: SyncStatus =
    offline
      ? 'offline'
      : syncing > 0
        ? 'syncing'
        : pendingSeconds > 0 || queuedCount > 0
          ? 'pending'
          : recordedSeconds > 0
            ? 'synced'
            : 'idle';

  const persistSnapshot = useCallback(() => {
    const client = sessionClientRef.current;
    if (!client) {
      // No live session: keep an existing recovery snapshot untouched unless
      // there is nothing left to recover.
      const existing = loadSnapshot();
      if (!existing || existing.runStartedAt === null) saveSnapshot(null);
      return;
    }
    saveSnapshot({
      sessionId: client.sessionId,
      mode: client.mode,
      subjectId: subjectGetterRef.current().id ?? null,
      subjectName: subjectGetterRef.current().name ?? null,
      recordedSeconds: recordedRef.current,
      runStartedAt: runStartRef.current,
      segStartIso: segStartRef.current || null,
      paused: !wantOpenRef.current,
      savedAt: Date.now(),
    });
  }, []);

  const applyStats = useCallback(
    (s: StudyStats) => {
      setStats(s);
      // Single propagation path into shared client state (also bumps the
      // context's statsRevision so mounted pages know to refetch their data).
      applyStudyStats(s);
    },
    [applyStudyStats]
  );

  const applyAck = useCallback(
    (ack: SegmentAck) => {
      recordedRef.current += ack.recordedSeconds;
      pendingRef.current = Math.max(0, pendingRef.current - ack.recordedSeconds);
      setRecordedSeconds(recordedRef.current);
      setPendingSeconds(pendingRef.current);
      sessionTotalsRef.current.seconds += ack.recordedSeconds;
      sessionTotalsRef.current.xp += ack.awardedXp;
      applyStats(ack.stats);
      setQueuedCount(getPendingSegments().length);
      if (ack.recordedSeconds > 0 || ack.awardedXp > 0) {
        if (awardTimeoutRef.current) clearTimeout(awardTimeoutRef.current);
        setLastAward({ seconds: ack.recordedSeconds, xp: ack.awardedXp, id: Date.now() });
        awardTimeoutRef.current = setTimeout(() => setLastAward(null), 6000);
      }
      persistSnapshot();
    },
    [applyStats, persistSnapshot]
  );

  async function trackInflight<T>(fn: () => Promise<T>): Promise<T> {
    inflightCountRef.current += 1;
    setSyncing(inflightCountRef.current);
    try {
      return await fn();
    } finally {
      inflightCountRef.current -= 1;
      setSyncing(inflightCountRef.current);
    }
  }

  /**
   * THE single persistence function (spec: flushStudyTime).
   * Concurrency-safe: if a flush is already running, callers await it rather
   * than starting an overlapping submission of the same seconds (#25).
   */
  const flushActive = useCallback((completed: boolean): Promise<void> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;

    const promise = trackInflight(async () => {
      const session = sessionClientRef.current;
      // Capture once; everything below derives from this instant.
      const endedAtMs = Date.now();
      const runDuration =
        runStartRef.current === null ? 0 : Math.floor((endedAtMs - runStartRef.current) / 1000);
      // Merge any held-back fragment from a previous short pause (spec #12).
      const duration = carriedSecondsRef.current + runDuration;
      const startedAt = segStartRef.current || new Date(endedAtMs - runDuration * 1000).toISOString();

      // Close the run immediately: resumed time always opens a NEW segment,
      // making accidental double-submission structurally impossible.
      runStartRef.current = null;
      segStartRef.current = '';

      if (!session) return;
      if (duration < MIN_SUBMIT_SECONDS) {
        // Too small to send on its own: hold it for the next segment instead
        // of discarding legitimate study time. On final completion there is
        // no next segment, so at most a couple of seconds end unrecorded.
        if (!completed) carriedSecondsRef.current = duration;
        else carriedSecondsRef.current = 0;
        return;
      }
      carriedSecondsRef.current = 0;

      devLog('study segment submitted', { sessionId: session.sessionId, durationSeconds: duration, completed });

      try {
        const outcome = await session.submit({
          durationSeconds: duration,
          startedAt,
          endedAt: new Date(endedAtMs).toISOString(),
          completed,
        });
        if (outcome.pending) {
          pendingRef.current += duration;
          setPendingSeconds(pendingRef.current);
          setQueuedCount(getPendingSegments().length);
          persistSnapshot();
        } else if (outcome.recorded && outcome.ack) {
          devLog('study segment acknowledged', {
            segmentId: outcome.ack.segmentId,
            duplicate: outcome.ack.duplicate,
            recordedSeconds: outcome.ack.recordedSeconds,
            awardedXp: outcome.ack.awardedXp,
          });
          applyAck(outcome.ack);
          if (outcome.ack.leveledUp && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('studyforge-levelup', { detail: { level: outcome.ack.stats.level } })
            );
          }
        }
      } catch {
        pendingRef.current += duration;
        setPendingSeconds(pendingRef.current);
        persistSnapshot();
      }
    }).finally(() => {
      flushPromiseRef.current = null;
    });

    flushPromiseRef.current = promise;
    return promise;
  }, [applyAck, persistSnapshot]);

  // ------------------------------------------------------------- session API

  /** Start a brand-new timer session (Start pressed from idle). */
  const beginSession = useCallback(() => {
    sessionClientRef.current = new StudySessionClient(mode, () => subjectGetterRef.current());
    sessionTotalsRef.current = { seconds: 0, xp: 0 };
    carriedSecondsRef.current = 0;
    recordedRef.current = 0;
    pendingRef.current = 0;
    setRecordedSeconds(0);
    setPendingSeconds(0);
    persistSnapshot();
  }, [mode, persistSnapshot]);

  /** Begin measuring active study time (idempotent). */
  const openRun = useCallback(() => {
    wantOpenRef.current = true;
    if (runStartRef.current === null) {
      runStartRef.current = Date.now();
      segStartRef.current = new Date().toISOString();
      persistSnapshot();
    }
  }, [persistSnapshot]);

  /**
   * Pause: persist the newly accumulated interval NOW and stop measuring (#6).
   * Resolves once the segment has been acked or durably queued.
   */
  const pauseAndFlush = useCallback(async (): Promise<void> => {
    wantOpenRef.current = false;
    await flushActive(false);
    persistSnapshot();
  }, [flushActive, persistSnapshot]);

  /** Resume: start accumulating a fresh unsaved interval. */
  const resumeRun = useCallback(() => openRun(), [openRun]);

  /** Stop/end the session: submit remaining time marked completed, then close. */
  const stopAndClose = useCallback(async (): Promise<void> => {
    wantOpenRef.current = false;
    await flushActive(true);
    sessionClientRef.current = null;
    saveSnapshot(null);
  }, [flushActive]);

  /**
   * Abandon the session WITHOUT marking anything completed (Reset / mode
   * switch). Call after flushing so any already-submitted segments keep their
   * correct `completed` flag.
   */
  const endSession = useCallback((): void => {
    wantOpenRef.current = false;
    sessionClientRef.current = null;
    saveSnapshot(null);
  }, []);

  /** Active (not yet submitted) seconds in the open run. */
  const activeSeconds = useCallback(
    () => (runStartRef.current === null ? 0 : Math.floor((Date.now() - runStartRef.current) / 1000)),
    []
  );

  /** Total studied in this timer session: acked + queued + held + accumulating. */
  const studiedSeconds = useCallback(
    () => recordedSeconds + pendingSeconds + carriedSecondsRef.current + activeSeconds(),
    [recordedSeconds, pendingSeconds, activeSeconds]
  );

  const refreshStatsNow = useCallback(async () => {
    // Context refresh: reads /api/study/stats, applies to shared state and
    // bumps statsRevision (read-only — never creates records).
    try {
      const s = await ctxRefreshStats();
      if (s) setStats(s);
    } finally {
      setStatsLoaded(true);
    }
  }, [ctxRefreshStats]);

  /** Totals accumulated (acked) during this session, for summary UIs. */
  const getSessionTotals = useCallback(() => ({ ...sessionTotalsRef.current }), []);

  // ------------------------------------------------------- mount / recovery

  useEffect(() => {
    if (!user) return;

    // 1. Recover any run orphaned by a refresh/close (spec #8). The
    //    deterministic id matches what pagehide would have enqueued, so the
    //    same orphaned interval can never be stored twice.
    const snap = loadSnapshot();
    if (snap && snap.runStartedAt !== null) {
      const elapsed = Math.floor((Date.now() - snap.runStartedAt) / 1000);
      if (elapsed >= MIN_SUBMIT_SECONDS) {
        enqueuePendingSegment({
          segmentId: deterministicOrphanId(snap.sessionId, snap.runStartedAt),
          sessionId: snap.sessionId,
          mode: snap.mode,
          subjectId: snap.subjectId,
          subjectName: snap.subjectName,
          startedAt: snap.segStartIso || new Date(snap.runStartedAt).toISOString(),
          endedAt: new Date().toISOString(),
          durationSeconds: elapsed,
          completed: false,
        });
        pendingRef.current += elapsed;
        setPendingSeconds(pendingRef.current);
      }
      saveSnapshot({ ...snap, runStartedAt: null, segStartIso: null, paused: true, savedAt: Date.now() });
    }

    // 2. Show authoritative stats immediately (context applies + notifies).
    ctxRefreshStats()
      .then((s) => {
        if (s) setStats(s);
      })
      .finally(() => setStatsLoaded(true));

    // 3. Retry queue: background + on reconnect.
    startPendingFlush((ack) => applyAck(ack));
    if (getPendingSegments().length > 0) {
      flushPendingSegments().catch(() => {});
    }

    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      flushPendingSegments((ack) => applyAck(ack)).catch(() => {});
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ------------------------------------------- periodic checkpoint (spec #10)

  useEffect(() => {
    const checkpoint = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (navigator.onLine === false) return;
      if (runStartRef.current === null) return;
      if (Date.now() - runStartRef.current < CHECKPOINT_MIN_SECONDS * 1000) return;

      await flushActive(false);
      // Keep measuring if the user hasn't paused meanwhile.
      if (wantOpenRef.current) openRun();
    }, CHECKPOINT_INTERVAL_MS);

    return () => clearInterval(checkpoint);
  }, [flushActive, openRun]);

  // ------------------------------------- lifecycle handlers (visibility etc.)

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Best-effort live submission; closes the run to avoid double counting.
        if (runStartRef.current !== null) void flushActive(false);
      } else if (wantOpenRef.current && runStartRef.current === null && sessionClientRef.current) {
        // Returning to the tab: reopen if the timer is still logically running.
        openRun();
      }
    };

    const onPageHide = () => {
      const session = sessionClientRef.current;
      if (!session || runStartRef.current === null) return;
      const duration = Math.floor((Date.now() - runStartRef.current) / 1000);
      if (duration < MIN_SUBMIT_SECONDS) return;
      // Durable enqueue with the deterministic orphan id: even if this exact
      // moment is later re-derived by reload recovery, the ids match and both
      // the local-queue dedupe and the server UNIQUE index collapse them into
      // a single record.
      enqueuePendingSegment({
        segmentId: deterministicOrphanId(session.sessionId, runStartRef.current),
        sessionId: session.sessionId,
        mode: session.mode,
        subjectId: subjectGetterRef.current().id ?? null,
        subjectName: subjectGetterRef.current().name ?? null,
        startedAt: segStartRef.current || new Date(Date.now() - duration * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: duration,
        completed: false,
      });
      runStartRef.current = null;
      segStartRef.current = '';
      // Keep the session view consistent: those seconds are now queued.
      pendingRef.current += duration;
      setPendingSeconds(pendingRef.current);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushActive, openRun]);

  useEffect(
    () => () => {
      if (awardTimeoutRef.current) clearTimeout(awardTimeoutRef.current);
    },
    []
  );

  return {
    // state
    status,
    recordedSeconds,
    pendingSeconds,
    lastAward,
    stats,
    statsLoaded,
    // actions
    beginSession,
    openRun,
    pauseAndFlush,
    resumeRun,
    stopAndClose,
    endSession,
    flushActive,
    refreshStatsNow,
    // queries
    activeSeconds,
    studiedSeconds,
    getSessionTotals,
  };
}
