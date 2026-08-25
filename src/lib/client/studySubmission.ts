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
}

const PENDING_KEY = 'studyforge-pending-segments';
/** Segments shorter than this are merged into the next one client-side, so
 * no studied time is ever discarded (server enforces the same 5s floor). */
export const MIN_SUBMIT_SECONDS = 5;

// ---------------------------------------------------------------------------
// Durable pending queue (temporary offline state only)
// ---------------------------------------------------------------------------

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

/** Try to flush any segments stranded by earlier failures. Returns acked count. */
export async function flushPendingSegments(
  onAck?: (ack: SegmentAck) => void
): Promise<number> {
  let acked = 0;
  let queue = getPendingSegments();
  if (queue.length === 0) return 0;

  // Newest last so stats converge forward.
  queue = [...queue].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const remaining: PendingSegment[] = [];

  for (const segment of queue) {
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
        // Network failure or transient server fault: keep for later retry.
        remaining.push({ ...segment, attempts: segment.attempts + 1 });
      } else {
        // Server rejected permanently (validation/auth). Drop the segment but
        // never mark the time as recorded in the UI — it simply wasn't saved.
        devLog('segment rejected permanently', { segmentId: segment.segmentId });
        console.warn('Segment rejected permanently:', segment.segmentId, err);
      }
    }
  }

  setPendingSegments(remaining);
  return acked;
}

let flushTimerStarted = false;

/** Start best-effort background retries (page load + periodic). Idempotent. */
export function startPendingFlush(onAck?: (ack: SegmentAck) => void): void {
  if (flushTimerStarted || typeof window === 'undefined') return;
  flushTimerStarted = true;
  window.addEventListener('online', () => {
    flushPendingSegments(onAck).catch(() => {});
  });
  window.setInterval(() => {
    if (getPendingSegments().length > 0 && navigator.onLine !== false) {
      flushPendingSegments(onAck).catch(() => {});
    }
  }, 30_000);
  if (getPendingSegments().length > 0) {
    // Give the auth context a moment to settle first.
    window.setTimeout(() => flushPendingSegments(onAck).catch(() => {}), 3000);
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

export async function refreshUserStats(): Promise<StudyStats | null> {
  try {
    const res = await fetch('/api/study/stats', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? (data.stats as StudyStats) : null;
  } catch {
    return null;
  }
}
