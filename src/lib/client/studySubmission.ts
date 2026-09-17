'use client';

/**
 * Client-side study-time submission pipeline.
 *
 * Responsibilities (measurement stays in the timer pages):
 * - Submit each active segment to POST /api/study/sessions/complete.
 * - Guarantee unique segmentIds so retries can never double-count.
 * - Queue failed submissions durably (localStorage) and retry with backoff,
 *   so study time is never silently lost on network failure.
 * - Expose authoritative stats refresh for the UI after each ack.
 *
 * localStorage here is ONLY temporary offline state — the server/D1 remains
 * the source of truth. Queued segments are removed as soon as the server acks.
 */

import { devLog } from './devLog';

export type StudyMode = 'stopwatch' | 'countdown' | 'pomodoro' | 'custom';

export interface StudyStats {
  totalStudySeconds: number;
  todayStudySeconds: number;
  weekStudySeconds: number;
  monthStudySeconds: number;
  studySessionCount: number;
  completedSessionCount: number;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  streak: number;
  bySubject?: Array<{ subjectId: string | null; subjectName: string | null; seconds: number }>;
  byDay?: Array<{ date: string; seconds: number }>;
  averageSessionSeconds?: number;
  longestStreak?: number;
  totalStudyDays?: number;
}

export interface CrossDeviceInfo {
  active: boolean;
  otherDevices: number;
  windowMinutes: number;
}

let lastCrossDevice: CrossDeviceInfo | null = null;

/** Most recent cross-device warning from /api/study/stats (null if unknown). */
export function getLastCrossDeviceWarning(): CrossDeviceInfo | null {
  return lastCrossDevice;
}

export interface SegmentAck {
  success: true;
  duplicate: boolean;
  sessionId: string;
  segmentId: string;
  recordedSeconds: number;
  awardedXp: number;
  leveledUp: boolean;
  stats: StudyStats;
}

export interface PendingSegment {
  segmentId: string;
  sessionId: string;
  mode: StudyMode;
  subjectId: string | null;
  subjectName: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completed: boolean;
  queuedAt: string;
  attempts: number;
  /** Stable per-browser id; preserved across migration so merges stay distinct. */
  deviceId?: string | null;
  /** Epoch ms before which this entry should not be retried (backoff). */
  nextRetryAt?: number;
}

const PENDING_KEY = 'studyforge-pending-segments';
const DEVICE_KEY = 'studyforge-device-id';
/** Anonymous (signed-out) study segments awaiting migration on sign-in. */
const ANON_KEY = 'studyforge-anon-segments';
/** Single segment must fit the server's maximum (XP_CONFIG.maxDurationSeconds). */
export const MAX_SEGMENT_SECONDS = 7200;
/** An open run older than this is treated as stale and never auto-credited. */
export const STALE_RUN_SECONDS = 12 * 3600;
/** Segments shorter than this are merged into the next one client-side, so
 * no studied time is ever discarded (server enforces the same 5s floor). */
export const MIN_SUBMIT_SECONDS = 5;

// ---------------------------------------------------------------------------
// Durable pending queue (temporary offline state only)
// ---------------------------------------------------------------------------

/**
 * Canonical active-timer snapshot (written ONLY by useStudyTimeSync). /hub
 * reads it to present the live timer state without owning a second timer
 * implementation.
 */
export interface ActiveTimerSnapshot {
  sessionId: string;
  mode: StudyMode;
  subjectId: string | null;
  subjectName: string | null;
  /** Seconds acknowledged by the server within this timer session. */
  recordedSeconds: number;
  /** Epoch ms of the open measurement run (null when paused/idle). */
  runStartedAt: number | null;
  segStartIso: string | null;
  paused: boolean;
  savedAt: number;
  carriedSeconds?: number;
  /** Set when the most recent timer mount recovered an orphaned run. */
  recovered?: boolean;
}

const ACTIVE_TIMER_KEY = 'studyforge-active-timer';

/** Read the canonical active-timer snapshot (null when no session is open). */
export function getActiveTimerSnapshot(): ActiveTimerSnapshot | null {
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

export type HubTimerState = 'active' | 'paused' | 'recovered' | 'other-tab' | 'none';

export interface HubActiveTimer {
  state: HubTimerState;
  snapshot: ActiveTimerSnapshot | null;
  /** Live seconds of the open run (0 when paused / not running). */
  elapsedSeconds: number;
  /** Total studied in the session (acknowledged + live). */
  totalSeconds: number;
}

export interface HubTimerStatusOptions {
  now: number;
  tabId: string;
  lock: TimerLock | null;
  /** Runs this old are discarded by the timer pipeline and treated as idle. */
  staleAfterSeconds?: number;
}

/**
 * Pure derivation of the /hub primary CTA state from the canonical timer
 * snapshot + lock. Never starts or stops anything — purely presentational.
 */
export function getHubActiveTimerStatus(
  snapshot: ActiveTimerSnapshot | null,
  opts: HubTimerStatusOptions
): HubActiveTimer {
  const staleAfter = opts.staleAfterSeconds ?? STALE_RUN_SECONDS;
  if (!snapshot) {
    return { state: 'none', snapshot: null, elapsedSeconds: 0, totalSeconds: 0 };
  }

  const runOpen = snapshot.runStartedAt !== null && !snapshot.paused;
  const runAge = runOpen ? (opts.now - (snapshot.runStartedAt as number)) / 1000 : 0;
  const savedAge = (opts.now - snapshot.savedAt) / 1000;
  if (runAge > staleAfter || savedAge > staleAfter) {
    // The timer pipeline discards stale runs; the hub should look idle too.
    return { state: 'none', snapshot, elapsedSeconds: 0, totalSeconds: snapshot.recordedSeconds ?? 0 };
  }

  // Another tab heartbeat this lock recently → it owns the live timer.
  if (opts.lock && opts.lock.tabId && opts.lock.tabId !== opts.tabId) {
    if (opts.now - opts.lock.updatedAt <= LOCK_TTL_MS) {
      return {
        state: 'other-tab',
        snapshot,
        elapsedSeconds: runOpen ? Math.floor(runAge) : 0,
        totalSeconds: (snapshot.recordedSeconds ?? 0) + (runOpen ? Math.floor(runAge) : 0),
      };
    }
  }

  if (snapshot.recovered === true && runOpen) {
    return {
      state: 'recovered',
      snapshot,
      elapsedSeconds: Math.floor(runAge),
      totalSeconds: (snapshot.recordedSeconds ?? 0) + Math.floor(runAge),
    };
  }

  if (runOpen) {
    return {
      state: 'active',
      snapshot,
      elapsedSeconds: Math.floor(runAge),
      totalSeconds: (snapshot.recordedSeconds ?? 0) + Math.floor(runAge),
    };
  }

  return { state: 'paused', snapshot, elapsedSeconds: 0, totalSeconds: snapshot.recordedSeconds ?? 0 };
}

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {}
  return null;
}

export function getPendingSegments(): PendingSegment[] {
  const store = safeStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingSegment[]) : [];
  } catch {
    return [];
  }
}

function setPendingSegments(list: PendingSegment[]): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {}
}

export function getPendingSeconds(): number {
  return getPendingSegments().reduce((sum, s) => sum + s.durationSeconds, 0);
}

/** Stable per-browser device id (created once, reused for every segment). */
export function getDeviceId(): string {
  const store = safeStorage();
  try {
    if (store) {
      const existing = store.getItem(DEVICE_KEY);
      if (existing) return existing;
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      store.setItem(DEVICE_KEY, id);
      return id;
    }
  } catch {}
  return 'ephemeral-device';
}

/** IANA timezone name of this browser (for tz-aware server stats). */
export function getClientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Clamp an open-run measurement to the server-accepted maximum so a
 * legitimate long run is never rejected wholesale (callers chunk first;
 * this is the last-resort guard for obviously invalid elapsed time from
 * slept laptops / throttled tabs).
 */
export function clampRunDurationSeconds(rawSeconds: number): number {
  if (!Number.isFinite(rawSeconds) || rawSeconds <= 0) return 0;
  return Math.min(Math.floor(rawSeconds), MAX_SEGMENT_SECONDS);
}

/** True when an orphaned run is too old to auto-credit safely. */
export function isStaleRun(elapsedSeconds: number): boolean {
  return elapsedSeconds > STALE_RUN_SECONDS;
}

/**
 * Split a large validated duration into server-accepted chunks (each
 * <= MAX_SEGMENT_SECONDS). Normal 20s checkpoints never need this; it
 * exists so recovery/clamped runs credit everything instead of dropping.
 */
export function chunkSegmentDurations(totalSeconds: number, max: number = MAX_SEGMENT_SECONDS): number[] {
  const total = Math.floor(totalSeconds);
  if (total <= 0) return [];
  const chunks: number[] = [];
  let rest = total;
  while (rest > 0) {
    const take = Math.min(rest, max);
    chunks.push(take);
    rest -= take;
  }
  return chunks;
}

/** Bounded exponential backoff for transient failures (1s,2s,4s... cap 30s). */
export function getBackoffMs(attempts: number): number {
  const n = Math.max(0, Math.floor(attempts));
  return Math.min(30_000, 1000 * 2 ** Math.min(n, 5));
}

// ---------------------------------------------------------------------------
// Anonymous local-first store (signed-out study time).
// ---------------------------------------------------------------------------

export function getAnonymousSegments(): PendingSegment[] {
  const store = safeStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(ANON_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingSegment[]) : [];
  } catch {
    return [];
  }
}

function setAnonymousSegments(list: PendingSegment[]): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(ANON_KEY, JSON.stringify(list));
  } catch {}
}

/** Persist a studied segment locally for a signed-out user (never dropped). */
export function saveAnonymousSegment(segment: Omit<PendingSegment, 'queuedAt' | 'attempts'>): void {
  const list = getAnonymousSegments();
  if (list.some((s) => s.segmentId === segment.segmentId)) return;
  list.push({ ...segment, deviceId: segment.deviceId ?? getDeviceId(), queuedAt: new Date().toISOString(), attempts: 0 });
  setAnonymousSegments(list);
}

export function getAnonymousSeconds(): number {
  return getAnonymousSegments().reduce((sum, s) => sum + s.durationSeconds, 0);
}

function removeAnonymousSegments(ids: Set<string>): void {
  if (ids.size === 0) return;
  setAnonymousSegments(getAnonymousSegments().filter((s) => !ids.has(s.segmentId)));
}

/**
 * Upload locally-stored anonymous segments to the freshly authenticated
 * account. Stable IDs are preserved so server idempotency collapses
 * double-submissions; entries are removed ONLY after acknowledgement.
 * Never wipes local history on failure.
 */
export async function migrateAnonymousSegments(
  onAck?: (ack: SegmentAck) => void
): Promise<{ migrated: number; failed: number }> {
  const pending = getAnonymousSegments();
  if (pending.length === 0) return { migrated: 0, failed: 0 };
  let migrated = 0;
  let failed = 0;
  const ackedIds = new Set<string>();
  for (const segment of [...pending].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
    try {
      const ack = await postSegment(segment);
      migrated++;
      ackedIds.add(segment.segmentId);
      onAck?.(ack);
    } catch (err) {
      if (isRetryableFailure(err)) {
        failed++;
        // Keep for the normal queue retry loop — do NOT delete.
      } else if (err instanceof HttpRejectionError && (err.status === 401 || err.status === 403)) {
        failed++;
        // Still signed out / session invalid: keep everything, retry after login.
        break;
      } else {
        // Definitively rejected (validation): drop only this entry so one
        // bad segment can never block the rest of the migration.
        ackedIds.add(segment.segmentId);
        failed++;
      }
    }
  }
  removeAnonymousSegments(ackedIds);
  return { migrated, failed };
}

/**
 * Persist a measured segment without a network round-trip. Used by
 * pagehide/visibilitychange handlers so unrecorded active time survives the
 * tab closing; it is flushed on the next load / reconnect.
 */
export function enqueuePendingSegment(
  segment: Omit<PendingSegment, 'queuedAt' | 'attempts'>
): void {
  const queue = getPendingSegments();
  if (queue.some((s) => s.segmentId === segment.segmentId)) return;
  queue.push({ ...segment, queuedAt: new Date().toISOString(), attempts: 0 });
  setPendingSegments(queue);
}

/**
 * Server refused the segment with an HTTP status. Carries the status so
 * callers can distinguish definitive validation failures (4xx) from
 * transient server faults (5xx/429), which MUST be retried — dropping them
 * silently is how study time used to vanish without a trace.
 */
export class HttpRejectionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpRejectionError';
    this.status = status;
  }
}

/** Transient failures (network errors and server-side faults) are retryable. */
function isRetryableFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch network-level failure
  if (err instanceof HttpRejectionError) return err.status >= 500 || err.status === 429;
  return false;
}

async function postSegment(segment: PendingSegment): Promise<SegmentAck> {
  const res = await fetch('/api/study/sessions/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      segmentId: segment.segmentId,
      sessionId: segment.sessionId,
      mode: segment.mode,
      subjectId: segment.subjectId,
      subjectName: segment.subjectName,
      deviceId: segment.deviceId ?? getDeviceId(),
      startedAt: segment.startedAt,
      endedAt: segment.endedAt,
      durationSeconds: segment.durationSeconds,
      completed: segment.completed,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new HttpRejectionError(res.status, data?.error || `Submission failed (${res.status})`);
  }
  return data as SegmentAck;
}

/** Why a queued entry was removed WITHOUT a successful acknowledgement. */
export type QueueDropReason = 'auth' | 'rejected';

/**
 * Try to flush any segments stranded by earlier failures.
 *
 * - `onAck` fires for every segment the server acknowledged (fresh or
 *   duplicate) so callers can reconcile state and clear "pending".
 * - `onDrop` fires when an entry must be removed without an ack: either the
 *   session is invalid (`'auth'`) or the server definitively rejected the
 *   payload (`'rejected'`). Callers MUST reconcile their pending view on
 *   drops too — otherwise the UI stays stuck in "pending" forever.
 */
export async function flushPendingSegments(
  onAck?: (ack: SegmentAck) => void,
  onDrop?: (segment: PendingSegment, reason: QueueDropReason, error: unknown) => void
): Promise<number> {
  let acked = 0;
  let queue = getPendingSegments();
  if (queue.length === 0) return 0;

  // Newest last so stats converge forward.
  queue = [...queue].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const remaining: PendingSegment[] = [];

  for (const segment of queue) {
    // Bounded backoff: entries that just failed sit out until nextRetryAt.
    if (segment.nextRetryAt && segment.nextRetryAt > Date.now()) {
      remaining.push(segment);
      continue;
    }
    try {
      const ack = await postSegment(segment);
      acked++;
      devLog('queued segment flushed', {
        segmentId: ack.segmentId,
        duplicate: ack.duplicate,
        recordedSeconds: ack.recordedSeconds,
        awardedXp: ack.awardedXp,
      });
      onAck?.(ack);
    } catch (err) {
      if (isRetryableFailure(err)) {
        // Network failure or transient server fault: keep for later retry
        // with bounded exponential backoff (never endless hot-looping).
        const attempts = segment.attempts + 1;
        remaining.push({ ...segment, attempts, nextRetryAt: Date.now() + getBackoffMs(attempts) });
      } else {
        // Definitive rejection. Auth problems are distinct: retrying cannot
        // succeed until the user signs in again.
        const reason: QueueDropReason =
          err instanceof HttpRejectionError && (err.status === 401 || err.status === 403)
            ? 'auth'
            : 'rejected';
        devLog('queue entry dropped', {
          segmentId: segment.segmentId,
          reason,
          status: err instanceof HttpRejectionError ? err.status : 'unknown',
        });
        console.warn('Segment dropped from queue:', segment.segmentId, reason, err);
        onDrop?.(segment, reason, err);
      }
    }
  }

  setPendingSegments(remaining);
  return acked;
}

let flushTimerStarted = false;

/** Start best-effort background retries (page load + periodic). Idempotent. */
export function startPendingFlush(
  onAck?: (ack: SegmentAck) => void,
  onDrop?: (segment: PendingSegment, reason: QueueDropReason, error: unknown) => void
): void {
  if (flushTimerStarted || typeof window === 'undefined') return;
  flushTimerStarted = true;
  window.addEventListener('online', () => {
    flushPendingSegments(onAck, onDrop).catch(() => {});
  });
  window.setInterval(() => {
    if (getPendingSegments().length > 0 && navigator.onLine !== false) {
      flushPendingSegments(onAck, onDrop).catch(() => {});
    }
  }, 30_000);
  if (getPendingSegments().length > 0) {
    // Give the auth context a moment to settle first.
    window.setTimeout(() => flushPendingSegments(onAck, onDrop).catch(() => {}), 3000);
  }
}

// ---------------------------------------------------------------------------
// Per-session client
// ---------------------------------------------------------------------------

export interface SegmentSubmitInput {
  /** Active seconds accumulated since the most recent resume. */
  durationSeconds: number;
  startedAt: string;
  endedAt?: string;
  completed?: boolean;
}

export interface SubmitOutcome {
  /** Server accepted (or had already recorded) the segment. */
  recorded: boolean;
  ack: SegmentAck | null;
  /** True when the request failed and the segment is queued for retry. */
  pending: boolean;
}

/**
 * One instance per running timer session. Hands out monotonic segment ids so
 * every pause/stop/completion has a stable identity across retries.
 */
export class StudySessionClient {
  readonly sessionId: string;
  private segmentCounter = 0;
  private inflight = new Set<string>();

  constructor(
    public mode: StudyMode,
    private getSubject: () => { id?: string; name?: string | null },
    sessionId?: string
  ) {
    this.sessionId =
      sessionId ||
      `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  nextSegmentId(): string {
    this.segmentCounter += 1;
    return `${this.sessionId}#${this.segmentCounter}`;
  }

  /**
   * Submit one active segment. On failure the exact payload is persisted and
   * retried later — callers must treat the time as "pending sync", NOT saved.
   */
  async submit(input: SegmentSubmitInput): Promise<SubmitOutcome> {
    const subject = this.getSubject();
    const segment: PendingSegment = {
      segmentId: this.nextSegmentId(),
      sessionId: this.sessionId,
      mode: this.mode,
      subjectId: subject.id ?? null,
      subjectName: subject.name ?? null,
      deviceId: getDeviceId(),
      startedAt: input.startedAt,
      endedAt: input.endedAt || new Date().toISOString(),
      durationSeconds: Math.floor(input.durationSeconds),
      completed: input.completed === true,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };

    if (this.inflight.has(segment.segmentId)) {
      return { recorded: false, ack: null, pending: false };
    }
    this.inflight.add(segment.segmentId);
    devLog('segment submit started', { segmentId: segment.segmentId, durationSeconds: segment.durationSeconds });
    try {
      const ack = await postSegment(segment);
      devLog('segment acknowledged', {
        segmentId: ack.segmentId,
        duplicate: ack.duplicate,
        recordedSeconds: ack.recordedSeconds,
        awardedXp: ack.awardedXp,
      });
      return { recorded: true, ack, pending: false };
    } catch (err) {
      if (isRetryableFailure(err)) {
        // Network failure or transient server fault (5xx/429): durable queue,
        // safe to retry (idempotent segmentId).
        const queue = getPendingSegments();
        if (!queue.some((s) => s.segmentId === segment.segmentId)) {
          queue.push(segment);
          setPendingSegments(queue);
        }
        devLog('segment queued for retry', {
          segmentId: segment.segmentId,
          durationSeconds: segment.durationSeconds,
          status: err instanceof HttpRejectionError ? err.status : 'network',
        });
        return { recorded: false, ack: null, pending: true };
      }
      // Permanent rejection (validation/auth): do not queue, do not fake success.
      devLog('segment rejected permanently', { segmentId: segment.segmentId });
      console.error('Segment rejected:', err);
      return { recorded: false, ack: null, pending: false };
    } finally {
      this.inflight.delete(segment.segmentId);
    }
  }
}

// ---------------------------------------------------------------------------
// Authoritative stats refresh
// ---------------------------------------------------------------------------

export async function refreshUserStats(timeZone?: string): Promise<StudyStats | null> {
  try {
    const tz = timeZone ?? getClientTimeZone();
    const res = await fetch(
      `/api/study/stats?tz=${encodeURIComponent(tz)}&deviceId=${encodeURIComponent(getDeviceId())}`,
      { credentials: 'include' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.crossDevice) lastCrossDevice = data.crossDevice as CrossDeviceInfo;
    return data?.success ? (data.stats as StudyStats) : null;
  } catch {
    return null;
  }
}

/** Grouped session history (one entry per studySessionId) from persisted data. */
export interface SessionHistoryEntry {
  sessionId: string;
  mode: string;
  subjectId: string | null;
  subjectName: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  segmentCount: number;
  completed: boolean;
}

export async function fetchSessionHistory(limit = 20): Promise<SessionHistoryEntry[] | null> {
  try {
    const res = await fetch(`/api/study/history?limit=${limit}`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? (data.sessions as SessionHistoryEntry[]) : null;
  } catch {
    return null;
  }
}

/**
 * Client-side fallback grouping for anonymous history: collapse locally
 * stored segments sharing a sessionId into session entries.
 */
export function groupAnonymousHistory(): SessionHistoryEntry[] {
  const groups = new Map<string, SessionHistoryEntry>();
  for (const s of getAnonymousSegments()) {
    const key = s.sessionId;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        sessionId: key,
        mode: s.mode,
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.durationSeconds,
        segmentCount: 1,
        completed: s.completed,
      });
    } else {
      g.durationSeconds += s.durationSeconds;
      g.segmentCount += 1;
      if (s.startedAt < g.startedAt) g.startedAt = s.startedAt;
      if (s.endedAt > g.endedAt) g.endedAt = s.endedAt;
      if (s.completed) g.completed = true;
      if (!g.subjectName && s.subjectName) {
        g.subjectName = s.subjectName;
        g.subjectId = s.subjectId;
      }
    }
  }
  return [...groups.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/**
 * Grouping key for raw StudySession rows (which predate the session_id
 * column): the `{session}#...` segment convention, else the row id.
 * Used by Hub / subject views so twenty 20s checkpoints render as one row.
 */
export function clientSessionGroupKey(row: { id: string; segmentId?: string | null }): string {
  const seg = row.segmentId ?? '';
  const hash = seg.indexOf('#');
  if (hash > 0) return seg.slice(0, hash);
  return row.id;
}

// ---------------------------------------------------------------------------
// Multi-tab ownership (one active owner per timer session).
// ---------------------------------------------------------------------------

const TIMER_LOCK_KEY = 'studyforge-timer-lock';
const LOCK_TTL_MS = 10_000;

export interface TimerLock {
  tabId: string;
  sessionId: string | null;
  updatedAt: number;
}

/** Stable id per browser tab (shared with the timer hook for consistency). */
let cachedBrowserTabId: string | null = null;
function newBrowserTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function getCurrentTabId(): string {
  if (!cachedBrowserTabId) cachedBrowserTabId = newBrowserTabId();
  return cachedBrowserTabId;
}

/** Pure helper: may this tab take (or keep) ownership of the timer lock? */
export function shouldTakeoverLock(lock: TimerLock | null, tabId: string, now: number): boolean {
  if (!lock) return true;
  if (lock.tabId === tabId) return true;
  return now - lock.updatedAt > LOCK_TTL_MS;
}

/**
 * Deterministic id family for one orphaned run: the first chunk matches what
 * pagehide enqueued, so reload recovery and pagehide collapse into a single
 * server record per chunk — never duplicated, never lost.
 */
export function orphanChunkIds(sessionId: string, runStartedAtMs: number, chunkCount: number): string[] {
  const base = `${sessionId}#p-${Math.floor(runStartedAtMs / 1000)}`;
  return Array.from({ length: Math.max(0, chunkCount) }, (_, i) => (i === 0 ? base : `${base}#c${i}`));
}

function readTimerLock(): TimerLock | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(TIMER_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TimerLock;
    return parsed && typeof parsed.tabId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** Read-only view of the timer lock (used by /hub to detect other-tab owners). */
export function getTimerLock(): TimerLock | null {
  return readTimerLock();
}

/** Claim ownership of the active timer; returns true when this tab owns it. */
export function claimTimerLock(tabId: string, sessionId: string | null): boolean {
  try {
    if (typeof window === 'undefined') return true;
    const now = Date.now();
    if (!shouldTakeoverLock(readTimerLock(), tabId, now)) return false;
    window.localStorage.setItem(TIMER_LOCK_KEY, JSON.stringify({ tabId, sessionId, updatedAt: now }));
    return true;
  } catch {
    return true;
  }
}

/** Refresh an owned lock (heartbeat). No-op when this tab is not the owner. */
export function heartbeatTimerLock(tabId: string, sessionId: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    const lock = readTimerLock();
    if (lock && lock.tabId !== tabId) return;
    window.localStorage.setItem(TIMER_LOCK_KEY, JSON.stringify({ tabId, sessionId, updatedAt: Date.now() }));
  } catch {}
}

/** Release ownership (stop/close). No-op when owned by another tab. */
export function releaseTimerLock(tabId: string): void {
  try {
    if (typeof window === 'undefined') return;
    const lock = readTimerLock();
    if (lock && lock.tabId !== tabId) return;
    window.localStorage.removeItem(TIMER_LOCK_KEY);
  } catch {}
}
