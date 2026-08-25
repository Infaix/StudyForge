import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SegmentAck } from '../studySubmission';

/**
 * Tests for the client-side submission transport: unique segment ids,
 * durable retry queue and idempotent resubmission semantics.
 * The server (D1 UNIQUE segment_id) is the final duplicate guard; these
 * tests verify the client never even needs it to kick in.
 */

type MemStorage = Record<string, string>;

function installFakeBrowser() {
  const store: MemStorage = {};
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
  (globalThis as Record<string, unknown>).window = { localStorage };
}

function queueKey(): string {
  const w = (globalThis as unknown as { window: { localStorage: { getItem(k: string): string | null } } }).window;
  return w.localStorage.getItem('studyforge-pending-segments') ?? '[]';
}

const okAck = (segmentId: string) => ({
  success: true,
  duplicate: false,
  sessionId: 's1',
  segmentId,
  recordedSeconds: 60,
  awardedXp: 1,
  leveledUp: false,
  stats: {
    totalStudySeconds: 60,
    todayStudySeconds: 60,
    weekStudySeconds: 60,
    monthStudySeconds: 60,
    studySessionCount: 1,
    completedSessionCount: 0,
    totalXp: 1,
    level: 1,
    xpIntoLevel: 1,
    xpForNextLevel: 100,
    progressPercent: 1,
    streak: 0,
  },
});

describe('studySubmission transport', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    installFakeBrowser();
    fetchMock = vi.fn();
    (globalThis as Record<string, unknown>).fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadModule() {
    return import('../studySubmission');
  }

  it('hands out unique monotonic segment ids per session', async () => {
    const { StudySessionClient } = await loadModule();
    const client = new StudySessionClient('stopwatch', () => ({ id: undefined, name: null }));
    const ids = new Set([client.nextSegmentId(), client.nextSegmentId(), client.nextSegmentId()]);
    expect(ids.size).toBe(3);
  });

  it('submits a segment with its identity and returns the ack', async () => {
    const { StudySessionClient } = await loadModule();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(okAck('s1#1')), { status: 200 }));

    const client = new StudySessionClient('countdown', () => ({ id: 'subj-1', name: 'Physics' }), 's1');
    const outcome = await client.submit({ durationSeconds: 600, startedAt: new Date().toISOString() });

    expect(outcome.recorded).toBe(true);
    expect(outcome.pending).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/study/sessions/complete');
    const body = JSON.parse(init.body);
    expect(body.segmentId).toBe('s1#1');
    expect(body.sessionId).toBe('s1');
    expect(body.durationSeconds).toBe(600);
    expect(body.subjectId).toBe('subj-1');
  });

  it('queues failed segments durably and retries the SAME segmentId', async () => {
    const { StudySessionClient, flushPendingSegments, getPendingSegments } = await loadModule();

    // First attempt: network failure.
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));

    const client = new StudySessionClient('pomodoro', () => ({ id: undefined, name: null }), 'sess-9');
    const outcome = await client.submit({
      durationSeconds: 1200,
      startedAt: new Date(Date.now() - 1_200_000).toISOString(),
    });
    expect(outcome.pending).toBe(true);

    // Segment survived in the durable queue with its identity intact.
    const queued = JSON.parse(queueKey());
    expect(queued).toHaveLength(1);
    expect(queued[0].segmentId).toBe('sess-9#1');
    expect(queued[0].durationSeconds).toBe(1200);

    // Reconnect: flush retries with the IDENTICAL id (server idempotency key).
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(okAck(queued[0].segmentId)), { status: 200 })
    );
    const acked = await flushPendingSegments();
    expect(acked).toBe(1);
    expect(fetchMock.mock.calls[1][1].body).toContain('"segmentId":"sess-9#1"');
    expect(getPendingSegments()).toHaveLength(0);
  });

  it('does not double-enqueue the same segmentId', async () => {
    const { enqueuePendingSegment, getPendingSegments } = await loadModule();
    const seg = {
      segmentId: 'sess-1#p-1700000000',
      sessionId: 'sess-1',
      mode: 'stopwatch' as const,
      subjectId: null,
      subjectName: null,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: 90,
      completed: false,
    };
    enqueuePendingSegment(seg);
    enqueuePendingSegment(seg); // e.g. pagehide + reload recovery
    expect(getPendingSegments()).toHaveLength(1);
  });

  it('drops permanently rejected segments instead of retrying forever', async () => {
    const { StudySessionClient, getPendingSegments } = await loadModule();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Segment too short' }), { status: 400 })
    );

    const client = new StudySessionClient('custom', () => ({ id: undefined, name: null }), 's2');
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outcome = await client.submit({ durationSeconds: 3, startedAt: new Date().toISOString() });

    expect(outcome.recorded).toBe(false);
    expect(outcome.pending).toBe(false); // not queued — will never succeed
    expect(getPendingSegments()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('queues segments when the server has a transient fault (5xx) and retries them', async () => {
    // Regression guard for the silent-data-loss bug: a 500 used to be treated
    // as a permanent rejection and the studied time was dropped forever.
    const { StudySessionClient, flushPendingSegments, getPendingSegments } = await loadModule();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'D1 unavailable' }), { status: 500 })
    );

    const client = new StudySessionClient('pomodoro', () => ({ id: undefined, name: null }), 's5xx');
    const outcome = await client.submit({
      durationSeconds: 1500,
      startedAt: new Date(Date.now() - 1_500_000).toISOString(),
    });

    expect(outcome.pending).toBe(true);
    expect(getPendingSegments()).toHaveLength(1);

    // Server recovers → the SAME segment is retried and acknowledged.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(okAck('s5xx#1')), { status: 200 })
    );
    const acked = await flushPendingSegments();
    expect(acked).toBe(1);
    expect(fetchMock.mock.calls[1][1].body).toContain('"segmentId":"s5xx#1"');
    expect(getPendingSegments()).toHaveLength(0);
  });

  it('treats 429 rate limiting as retryable', async () => {
    const { StudySessionClient, getPendingSegments } = await loadModule();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'Too many requests' }), { status: 429 })
    );
    const client = new StudySessionClient('stopwatch', () => ({ id: undefined, name: null }), 's429');
    const outcome = await client.submit({
      durationSeconds: 60,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(outcome.pending).toBe(true);
    expect(getPendingSegments()).toHaveLength(1);
  });

  it('keeps unacked segments when some flushes fail mid-batch', async () => {
    const { enqueuePendingSegment, flushPendingSegments, getPendingSegments } = await loadModule();

    enqueuePendingSegment({
      segmentId: 'a#1', sessionId: 'a', mode: 'stopwatch', subjectId: null,
      subjectName: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 100, completed: false,
    });
    enqueuePendingSegment({
      segmentId: 'b#1', sessionId: 'b', mode: 'stopwatch', subjectId: null,
      subjectName: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 200, completed: false,
    });

    fetchMock
      .mockRejectedValueOnce(new TypeError('still offline')) // a#1 fails
      .mockResolvedValueOnce(new Response(JSON.stringify(okAck('b#1')), { status: 200 })); // b#1 ok

    const acked = await flushPendingSegments();
    expect(acked).toBe(1);
    const remaining = getPendingSegments();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].segmentId).toBe('a#1');
  });

  it('propagates the authoritative ack (with stats) to onAck during flush', async () => {
    // This is the propagation path consumed by AuthContext.applyStudyStats:
    // whatever the server returns must reach the UI layer untouched.
    const { enqueuePendingSegment, flushPendingSegments } = await loadModule();

    const authoritativeStats = {
      totalStudySeconds: 486,
      todayStudySeconds: 486,
      weekStudySeconds: 486,
      monthStudySeconds: 486,
      studySessionCount: 3,
      completedSessionCount: 1,
      totalXp: 8,
      level: 1,
      xpIntoLevel: 8,
      xpForNextLevel: 100,
      progressPercent: 8,
      streak: 2,
    };
    enqueuePendingSegment({
      segmentId: 'c#1', sessionId: 'c', mode: 'stopwatch', subjectId: null,
      subjectName: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 180, completed: false,
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ...okAck('c#1'), recordedSeconds: 180, awardedXp: 3, stats: authoritativeStats }),
        { status: 200 }
      )
    );

    const seenAcks: SegmentAck[] = [];
    const acked = await flushPendingSegments((ack) => seenAcks.push(ack));
    expect(acked).toBe(1);
    expect(seenAcks).toHaveLength(1);
    expect(seenAcks[0].segmentId).toBe('c#1');
    expect(seenAcks[0].awardedXp).toBe(3);
    expect(seenAcks[0].stats).toEqual(authoritativeStats);
  });
});
