'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  StudySessionClient,
  StudyStats,
  SegmentAck,
  StudyMode,
  MIN_SUBMIT_SECONDS,
  STALE_RUN_SECONDS,
  flushPendingSegments,
  getPendingSegments,
  startPendingFlush,
  enqueuePendingSegment,
  saveAnonymousSegment,
  getAnonymousSegments,
  getAnonymousSeconds,
  migrateAnonymousSegments,
  getDeviceId,
  clampRunDurationSeconds,
  isStaleRun,
  chunkSegmentDurations,
  orphanChunkIds,
  claimTimerLock,
  heartbeatTimerLock,
  releaseTimerLock,
  QueueDropReason,
} from './studySubmission';
import { devLog } from './devLog';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'offline' | 'local';
/** Distinct failure classes so the UI can show accurate sync messages. */
export type SyncProblem = 'auth' | 'server' | 'network' | null;

/** User-facing sync message in the spec's vocabulary. */
export type SyncDisplay = 'saved' | 'saving' | 'syncing' | 'offline' | 'local' | 'problem' | 'idle';

export interface RecoveredNotice {
  kind: 'recovered' | 'stale';
  subjectName: string | null;
  seconds: number;
}

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
 *   The timer keeps measuring across the reload so no valid time is lost,
 *   while implausibly long orphaned runs are discarded, never credited.
 * - Offline failures land in a durable queue that retries automatically
 *   (#23/#24) while the timer keeps running.
 * - Anonymous (signed-out) users persist locally with the same guarantees;
 *   segments migrate to the account on sign-in with stable IDs (#9).
 * - Multi-tab: only one tab owns a recovered session; a second tab acts as
 *   a follower instead of double-counting (#10).
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
  carriedSeconds?: number;
}

function newTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** One stable id per browser tab (shared by every hook instance in the tab). */
let cachedTabId: string | null = null;
function getTabId(): string {
  if (!cachedTabId) cachedTabId = newTabId();
  return cachedTabId;
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
  const isAnonymous = !user;

  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [anonSeconds, setAnonSeconds] = useState(0);
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
  const [lastProblem, setLastProblem] = useState<SyncProblem>(null);
  const [recoveredNotice, setRecoveredNotice] = useState<RecoveredNotice | null>(null);
  const [tabConflict, setTabConflict] = useState(false);

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
  const tabIdRef = useRef<string>(getTabId());
  const lastStatsRefreshRef = useRef(0);
  useEffect(() => {
    subjectGetterRef.current = getSubject;
  });

  const status: SyncStatus =
    isAnonymous
      ? 'local'
      : offline
        ? 'offline'
        : syncing > 0
          ? 'syncing'
          : pendingSeconds > 0 || queuedCount > 0
            ? 'pending'
            : recordedSeconds > 0
              ? 'synced'
              : 'idle';

  /** Spec-vocabulary sync state for banners and hub UX (#7). */
  const syncDisplay: SyncDisplay =
    status === 'local'
      ? 'local'
      : status === 'offline'
        ? 'offline'
        : lastProblem === 'auth' || lastProblem === 'server'
          ? 'problem'
          : status === 'syncing'
            ? queuedCount > 0
              ? 'syncing'
              : 'saving'
            : status === 'pending'
              ? 'saving'
              : status === 'synced'
                ? 'saved'
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
      carriedSeconds: carriedSecondsRef.current,
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
      // A successful acknowledgement proves connectivity + auth are fine.
      setLastProblem(null);
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

  /**
   * Recompute the pending view from the durable queue — THE source of truth
   * for "how much is waiting". Every flush path ends here so no success,
   * drop or failure can ever leave phantom "pending" state behind.
   */
  const reconcilePendingFromQueue = useCallback(() => {
    const queue = getPendingSegments();
    const total = queue.reduce((sum, s) => sum + s.durationSeconds, 0);
    pendingRef.current = total;
    setPendingSeconds(total);
    setQueuedCount(queue.length);
  }, []);

  const reconcileAnonFromStore = useCallback(() => {
    setAnonSeconds(getAnonymousSeconds());
  }, []);

  const handleQueueDrop = useCallback(
    (_segment: { segmentId: string }, reason: QueueDropReason) => {
      if (reason === 'auth') setLastProblem('auth');
      // 'rejected' entries are gone from the queue; reconciliation below
      // clears their seconds from the pending view.
    },
    []
  );

  /**
   * The ONE queue-flush entry point used by mount recovery, reconnects and
   * the background retry loop: acks update state, drops are classified, and
   * the pending view is ALWAYS reconciled afterwards.
   */
  const runQueueFlush = useCallback(async (): Promise<void> => {
    if (!user) return;
    try {
      await flushPendingSegments((ack) => applyAck(ack), handleQueueDrop);
    } catch {
      // Never let a flush error escape; reconciliation below keeps truth.
    } finally {
      reconcilePendingFromQueue();
    }
  }, [applyAck, handleQueueDrop, reconcilePendingFromQueue, user]);

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
   * Persist one open run to durable storage. Authenticated: submit chunked
   * server segments (each <= MAX_SEGMENT_SECONDS so implausible runs can
   * never be rejected wholesale). Anonymous: store locally with the same
   * stable IDs for later migration. Stale runs (>12h) are discarded, never
   * credited.
   */
  const persistRunChunks = useCallback(
    async (
      session: StudySessionClient,
      totalSeconds: number,
      segStartIso: string,
      endedAtMs: number,
      completed: boolean
    ): Promise<void> => {
      const chunks = chunkSegmentDurations(totalSeconds);
      if (chunks.length === 0) return;
      let offsetSec = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const last = i === chunks.length - 1;
        const startedAt = new Date(new Date(segStartIso).getTime() + offsetSec * 1000).toISOString();
        const endedAt = new Date(new Date(segStartIso).getTime() + (offsetSec + chunk) * 1000).toISOString();
        offsetSec += chunk;
        if (!user) {
          // Anonymous: durable local record with the migration-stable ID.
          const segmentId = session.nextSegmentId();
          const subj = subjectGetterRef.current();
          saveAnonymousSegment({
            segmentId,
            sessionId: session.sessionId,
            mode: session.mode,
            subjectId: subj.id ?? null,
            subjectName: subj.name ?? null,
            deviceId: getDeviceId(),
            startedAt,
            endedAt,
            durationSeconds: chunk,
            completed: last && completed,
          });
          recordedRef.current += chunk;
          setRecordedSeconds(recordedRef.current);
          sessionTotalsRef.current.seconds += chunk;
          reconcileAnonFromStore();
          persistSnapshot();
          continue;
        }
        const outcome = await session.submit({
          durationSeconds: chunk,
          startedAt,
          endedAt: last ? new Date(endedAtMs).toISOString() : endedAt,
          completed: last && completed,
        });
        if (outcome.pending) {
          // submit() has already durably queued it; reconcile to queue truth.
          setLastProblem(navigator.onLine === false ? 'network' : 'server');
          reconcilePendingFromQueue();
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
      }
    },
    [applyAck, persistSnapshot, reconcileAnonFromStore, reconcilePendingFromQueue, user]
  );

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
      const rawRun =
        runStartRef.current === null ? 0 : Math.floor((endedAtMs - runStartRef.current) / 1000);
      const capturedSegStart = segStartRef.current;

      // Close the run immediately: resumed time always opens a NEW segment,
      // making accidental double-submission structurally impossible.
      runStartRef.current = null;
      segStartRef.current = '';

      if (!session) return;
      if (isStaleRun(rawRun)) {
        // Slept laptop / ancient orphan: never credit blindly (#16).
        carriedSecondsRef.current = 0;
        devLog('stale run discarded', { sessionId: session.sessionId, rawRunSeconds: rawRun });
        persistSnapshot();
        return;
      }
      // Merge any held-back fragment from a previous short pause (spec #12),
      // then clamp to the server-accepted maximum (chunked below).
      const startedAt = capturedSegStart || new Date(endedAtMs - rawRun * 1000).toISOString();
      const total = clampRunDurationSeconds(carriedSecondsRef.current + rawRun);

      if (total < MIN_SUBMIT_SECONDS) {
        // Too small to send on its own: hold it for the next segment instead
        // of discarding legitimate study time. On final completion there is
        // no next segment, so at most a couple of seconds end unrecorded.
        if (!completed) carriedSecondsRef.current = total;
        else carriedSecondsRef.current = 0;
        return;
      }
      carriedSecondsRef.current = 0;

      devLog('study segment submitted', { sessionId: session.sessionId, durationSeconds: total, completed });

      try {
        await persistRunChunks(session, total, startedAt, endedAtMs, completed);
      } catch {
        // Unexpected failure escaping submit(): reconcile to whatever the
        // durable queue holds so the pending view can never drift.
        setLastProblem(navigator.onLine === false ? 'network' : 'server');
        if (user) reconcilePendingFromQueue();
        else reconcileAnonFromStore();
      }
    }).finally(() => {
      flushPromiseRef.current = null;
      // Single coordinator guarantee: after ANY submission attempt (pause,
      // checkpoint, completion) the pending view matches the durable queue.
      if (user) reconcilePendingFromQueue();
      else reconcileAnonFromStore();
    });

    flushPromiseRef.current = promise;
    return promise;
  }, [persistRunChunks, persistSnapshot, reconcileAnonFromStore, reconcilePendingFromQueue, user]);

  // ------------------------------------------------------------- session API

  /** Start a brand-new timer session (Start pressed from idle). */
  const beginSession = useCallback(() => {
    sessionClientRef.current = new StudySessionClient(mode, () => subjectGetterRef.current());
    claimTimerLock(tabIdRef.current, sessionClientRef.current.sessionId);
    setTabConflict(false);
    sessionTotalsRef.current = { seconds: 0, xp: 0 };
    carriedSecondsRef.current = 0;
    recordedRef.current = 0;
    pendingRef.current = 0;
    setRecordedSeconds(0);
    setPendingSeconds(0);
    setRecoveredNotice(null);
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
  const resumeRun = useCallback(() => {
    setRecoveredNotice(null);
    openRun();
  }, [openRun]);

  /** Stop/end the session: submit remaining time marked completed, then close. */
  const stopAndClose = useCallback(async (): Promise<void> => {
    wantOpenRef.current = false;
    await flushActive(true);
    sessionClientRef.current = null;
    releaseTimerLock(tabIdRef.current);
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
    releaseTimerLock(tabIdRef.current);
    saveSnapshot(null);
  }, []);

  /** Active (not yet submitted) seconds in the open run. */
  const activeSeconds = useCallback(
    () => {
      if (runStartRef.current === null) return 0;
      const raw = Math.floor((Date.now() - runStartRef.current) / 1000);
      // Display guard: never show implausible elapsed (sleep/throttle).
      if (raw > STALE_RUN_SECONDS) return STALE_RUN_SECONDS;
      return Math.max(0, raw);
    },
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
    if (!user) {
      setStatsLoaded(true);
      return;
    }
    try {
      const s = await ctxRefreshStats();
      if (s) setStats(s);
      lastStatsRefreshRef.current = Date.now();
    } finally {
      setStatsLoaded(true);
    }
  }, [ctxRefreshStats, user]);

  /** Totals accumulated (acked) during this session, for summary UIs. */
  const getSessionTotals = useCallback(() => ({ ...sessionTotalsRef.current }), []);

  const clearRecoveredNotice = useCallback(() => setRecoveredNotice(null), []);

  // ------------------------------------------------------- mount / recovery

  useEffect(() => {
    const tabId = tabIdRef.current;
    const snap = loadSnapshot();

    // Multi-tab: a second tab must not operate the same recovered timer.
    // Only the lock owner reconciles the orphan and resumes measuring.
    let ownsRecovery = true;
    if (snap && snap.runStartedAt !== null) {
      ownsRecovery = claimTimerLock(tabId, snap.sessionId);
      setTabConflict(!ownsRecovery);
    }

    if (snap && snap.runStartedAt !== null && ownsRecovery) {
      const elapsed = Math.floor((Date.now() - snap.runStartedAt) / 1000);
      if (isStaleRun(elapsed)) {
        // Clearly stale state: restore the session shell (recorded totals)
        // but never credit the ancient open run (#16).
        sessionClientRef.current = new StudySessionClient(snap.mode, () => subjectGetterRef.current(), snap.sessionId);
        recordedRef.current = snap.recordedSeconds ?? 0;
        setRecordedSeconds(recordedRef.current);
        carriedSecondsRef.current = 0;
        setRecoveredNotice({ kind: 'stale', subjectName: snap.subjectName, seconds: snap.recordedSeconds ?? 0 });
        saveSnapshot({ ...snap, runStartedAt: null, segStartIso: null, paused: true, savedAt: Date.now() });
      } else if (elapsed >= MIN_SUBMIT_SECONDS) {
        // Reconcile the orphaned run under its deterministic id, chunked so
        // long-but-plausible orphans fit the server maximum. pagehide-enqueue
        // and this recovery share the id family, so the same interval can
        // never be stored twice.
        const clamped = clampRunDurationSeconds(elapsed);
        const chunks = chunkSegmentDurations(clamped);
        const ids = orphanChunkIds(snap.sessionId, snap.runStartedAt, chunks.length);
        const segStart = snap.segStartIso || new Date(snap.runStartedAt).toISOString();
        const segStartMs = new Date(segStart).getTime();
        chunks.forEach((dur, i) => {
          const offsetMs = chunks.slice(0, i).reduce((a, b) => a + b * 1000, 0);
          const payload = {
            segmentId: ids[i],
            sessionId: snap.sessionId,
            mode: snap.mode,
            subjectId: snap.subjectId,
            subjectName: snap.subjectName,
            startedAt: new Date(segStartMs + offsetMs).toISOString(),
            endedAt: new Date(segStartMs + offsetMs + dur * 1000).toISOString(),
            durationSeconds: dur,
            completed: false,
          };
          if (user) enqueuePendingSegment(payload);
          else saveAnonymousSegment(payload);
        });
        // Restore the session shell and KEEP measuring so the acceptance
        // flow (refresh mid-session) loses nothing after the checkpoint gap.
        sessionClientRef.current = new StudySessionClient(snap.mode, () => subjectGetterRef.current(), snap.sessionId);
        recordedRef.current = snap.recordedSeconds ?? 0;
        setRecordedSeconds(recordedRef.current);
        carriedSecondsRef.current = snap.carriedSeconds ?? 0;
        runStartRef.current = Date.now();
        segStartRef.current = new Date().toISOString();
        wantOpenRef.current = true;
        if (user) reconcilePendingFromQueue();
        else reconcileAnonFromStore();
        setRecoveredNotice({ kind: 'recovered', subjectName: snap.subjectName, seconds: clamped });
        persistSnapshot();
      } else {
        // Tiny orphan below the minimum: fold into carried time and resume.
        sessionClientRef.current = new StudySessionClient(snap.mode, () => subjectGetterRef.current(), snap.sessionId);
        recordedRef.current = snap.recordedSeconds ?? 0;
        setRecordedSeconds(recordedRef.current);
        carriedSecondsRef.current = (snap.carriedSeconds ?? 0) + Math.max(0, elapsed);
        runStartRef.current = Date.now();
        segStartRef.current = new Date().toISOString();
        wantOpenRef.current = true;
        persistSnapshot();
      }
    } else if (snap && ownsRecovery) {
      // Paused/idle snapshot: restore the shell without auto-measuring.
      sessionClientRef.current = new StudySessionClient(snap.mode, () => subjectGetterRef.current(), snap.sessionId);
      recordedRef.current = snap.recordedSeconds ?? 0;
      setRecordedSeconds(recordedRef.current);
      carriedSecondsRef.current = snap.carriedSeconds ?? 0;
    }

    if (!user) {
      // Anonymous: local totals are the stats; nothing server-side to read.
      reconcileAnonFromStore();
      setStatsLoaded(true);
    } else {
      // 2. Show authoritative stats immediately (context applies + notifies).
      ctxRefreshStats()
        .then((s) => {
          if (s) setStats(s);
        })
        .finally(() => setStatsLoaded(true));

      // 3. Retry queue: background + on reconnect. ALL flush paths go through
      //    runQueueFlush so acks apply AND the pending view always reconciles —
      //    a successful retry can never leave "pending" stuck on screen.
      startPendingFlush((ack) => applyAck(ack), handleQueueDrop);
      if (getPendingSegments().length > 0) {
        void runQueueFlush();
      }
      // 4. Migrate any anonymous segments stored before sign-in (#9).
      if (getAnonymousSegments().length > 0) {
        void migrateAnonymousSegments((ack) => applyAck(ack)).then(() => {
          reconcilePendingFromQueue();
          reconcileAnonFromStore();
        });
      }
    }

    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      if (user) void runQueueFlush();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    // Lock heartbeat while this tab owns a session.
    const heartbeat = window.setInterval(() => {
      if (sessionClientRef.current) heartbeatTimerLock(tabId, sessionClientRef.current.sessionId);
    }, 5000);

    // Cross-tab lock changes (another tab took over).
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_TIMER_KEY && sessionClientRef.current && runStartRef.current !== null) {
        setTabConflict(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(heartbeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Anonymous -> signed-in migration when the account appears after mount.
  useEffect(() => {
    if (!user) return;
    if (getAnonymousSegments().length === 0) return;
    void migrateAnonymousSegments((ack) => applyAck(ack)).then(() => {
      reconcilePendingFromQueue();
      reconcileAnonFromStore();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Global flush hook so sign-out / navigation can persist the open run
  // before the session cookie disappears (queue is durable regardless).
  useEffect(() => {
    (window as unknown as { __studyforgeFlushAll?: () => Promise<void> }).__studyforgeFlushAll = async () => {
      await flushActive(false);
      persistSnapshot();
    };
    return () => {
      delete (window as unknown as { __studyforgeFlushAll?: () => Promise<void> }).__studyforgeFlushAll;
    };
  }, [flushActive, persistSnapshot]);

  // ------------------------------------------- periodic checkpoint (spec #10)

  useEffect(() => {
    const checkpoint = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (runStartRef.current === null) return;
      // Anonymous checkpoints persist locally, so they run offline too;
      // authenticated checkpoints need connectivity (else the queue grows
      // one 20s entry per tick — pagehide/pause still capture the time).
      if (user && navigator.onLine === false) return;
      if (Date.now() - runStartRef.current < CHECKPOINT_MIN_SECONDS * 1000) return;

      await flushActive(false);
      // Keep measuring if the user hasn't paused meanwhile.
      if (wantOpenRef.current) openRun();
    }, CHECKPOINT_INTERVAL_MS);

    return () => clearInterval(checkpoint);
  }, [flushActive, openRun, user]);

  // ------------------------------------- lifecycle handlers (visibility etc.)

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Best-effort live submission; closes the run to avoid double counting.
        if (runStartRef.current !== null) void flushActive(false);
      } else {
        if (wantOpenRef.current && runStartRef.current === null && sessionClientRef.current) {
          // Returning to the tab: reopen if the timer is still logically running.
          openRun();
        } else if (
          user &&
          runStartRef.current === null &&
          Date.now() - lastStatsRefreshRef.current > 30_000
        ) {
          // Idle return: lightweight authoritative refresh so another
          // device's study time appears without a full reload (#8).
          void refreshStatsNow();
        }
      }
    };

    const onPageHide = () => {
      const session = sessionClientRef.current;
      if (!session || runStartRef.current === null) return;
      const rawDuration = Math.floor((Date.now() - runStartRef.current) / 1000);
      if (rawDuration < MIN_SUBMIT_SECONDS) return;
      if (isStaleRun(rawDuration)) {
        runStartRef.current = null;
        segStartRef.current = '';
        return;
      }
      // Durable enqueue with the deterministic orphan id family: even if this
      // exact moment is later re-derived by reload recovery, the ids match
      // and both the local-queue dedupe and the server UNIQUE index collapse
      // them into a single record.
      const chunks = chunkSegmentDurations(clampRunDurationSeconds(rawDuration));
      const ids = orphanChunkIds(session.sessionId, runStartRef.current as number, chunks.length);
      const segStartMs = segStartRef.current
        ? new Date(segStartRef.current).getTime()
        : Date.now() - rawDuration * 1000;
      chunks.forEach((dur, i) => {
        const offsetMs = chunks.slice(0, i).reduce((a, b) => a + b * 1000, 0);
        const payload = {
          segmentId: ids[i],
          sessionId: session.sessionId,
          mode: session.mode,
          subjectId: subjectGetterRef.current().id ?? null,
          subjectName: subjectGetterRef.current().name ?? null,
          deviceId: getDeviceId(),
          startedAt: new Date(segStartMs + offsetMs).toISOString(),
          endedAt: new Date(segStartMs + offsetMs + dur * 1000).toISOString(),
          durationSeconds: dur,
          completed: false,
        };
        if (user) enqueuePendingSegment(payload);
        else saveAnonymousSegment(payload);
      });
      runStartRef.current = null;
      segStartRef.current = '';
      // Keep the session view consistent: those seconds are now queued.
      if (user) {
        const queued = getPendingSegments().reduce((sum, s) => sum + s.durationSeconds, 0);
        pendingRef.current = queued;
        setPendingSeconds(queued);
      } else {
        reconcileAnonFromStore();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushActive, openRun, refreshStatsNow, reconcileAnonFromStore, user]);

  useEffect(
    () => () => {
      if (awardTimeoutRef.current) clearTimeout(awardTimeoutRef.current);
    },
    []
  );

  return {
    // state
    status,
    syncDisplay,
    recordedSeconds,
    pendingSeconds,
    anonSeconds,
    isAnonymous,
    lastAward,
    stats,
    statsLoaded,
    lastProblem,
    queuedCount,
    recoveredNotice,
    tabConflict,
    // actions
    beginSession,
    openRun,
    pauseAndFlush,
    resumeRun,
    stopAndClose,
    endSession,
    flushActive,
    refreshStatsNow,
    clearRecoveredNotice,
    // queries
    activeSeconds,
    studiedSeconds,
    getSessionTotals,
  };
}
