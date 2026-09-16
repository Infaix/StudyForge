import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the offline-first sync guards: run clamping, stale detection,
 * chunking, backoff, multi-tab ownership, anonymous local-first storage and
 * anonymous -> authenticated migration.
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

const okAck = (segmentId: string, recordedSeconds = 60) => ({
  success: true,
  duplicate: false,
  sessionId: 's1',
  segmentId,
  recordedSeconds,
  awardedXp: 1,
  leveledUp: false,
  stats: {
    totalStudySeconds: recordedSeconds,
    todayStudySeconds: recordedSeconds,
    weekStudySeconds: recordedSeconds,
    monthStudySeconds: recordedSeconds,
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

describe('study sync guards', () => {
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

  it('clamps implausible run durations to the server maximum', async () => {
    const { clampRunDurationSeconds, MAX_SEGMENT_SECONDS } = await loadModule();
    expect(clampRunDurationSeconds(20)).toBe(20);
    expect(clampRunDurationSeconds(8 * 3600)).toBe(MAX_SEGMENT_SECONDS);
    expect(clampRunDurationSeconds(0)).toBe(0);
    expect(clampRunDurationSeconds(-5)).toBe(0);
    expect(clampRunDurationSeconds(NaN)).toBe(0);
  });

  it('flags stale runs that must never be auto-credited', async () => {
    const { isStaleRun, STALE_RUN_SECONDS } = await loadModule();
    expect(isStaleRun(60)).toBe(false);
    expect(isStaleRun(2 * 3600)).toBe(false);
    expect(isStaleRun(STALE_RUN_SECONDS)).toBe(false);
    expect(isStaleRun(STALE_RUN_SECONDS + 1)).toBe(true);
    expect(isStaleRun(48 * 3600)).toBe(true);
  });

  it('chunks large durations into server-accepted pieces without loss', async () => {
    const { chunkSegmentDurations, MAX_SEGMENT_SECONDS } = await loadModule();
    expect(chunkSegmentDurations(20)).toEqual([20]);
    expect(chunkSegmentDurations(0)).toEqual([]);
    const chunks = chunkSegmentDurations(MAX_SEGMENT_SECONDS * 2 + 100);
    expect(chunks).toEqual([MAX_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS, 100]);
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(MAX_SEGMENT_SECONDS * 2 + 100);
    expect(chunks.every((c) => c <= MAX_SEGMENT_SECONDS)).toBe(true);
  });

  it('derives a deterministic orphan id family shared by pagehide + recovery', async () => {
    const { orphanChunkIds } = await loadModule();
    const ids = orphanChunkIds('run-1', 1_700_000_000_123, 3);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('run-1#p-1700000000');
    expect(new Set(ids).size).toBe(3);
    // Same inputs always produce the same family (dedupe guarantee).
    expect(orphanChunkIds('run-1', 1_700_000_000_123, 3)).toEqual(ids);
    expect(orphanChunkIds('run-1', 1_700_000_000_123, 0)).toEqual([]);
  });

  it('backs off transient retries with a bounded exponential schedule', async () => {
    const { getBackoffMs } = await loadModule();
    expect(getBackoffMs(0)).toBe(1000);
    expect(getBackoffMs(1)).toBe(2000);
    expect(getBackoffMs(2)).toBe(4000);
    expect(getBackoffMs(100)).toBe(30_000); // capped, never endless growth
  });

  it('honours backoff windows during queue flush', async () => {
    const { enqueuePendingSegment, flushPendingSegments, getPendingSegments } = await loadModule();
    enqueuePendingSegment({
      segmentId: 'backoff#1', sessionId: 'backoff', mode: 'stopwatch', subjectId: null,
      subjectName: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 120, completed: false,
    });
    // First flush: transient 500 -> kept with a future nextRetryAt.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'boom' }), { status: 500 })
    );
    await flushPendingSegments();
    expect(getPendingSegments()).toHaveLength(1);
    const callsAfterFirst = fetchMock.mock.calls.length;

    // Immediate second flush must NOT hit the network again (backoff).
    await flushPendingSegments();
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(getPendingSegments()).toHaveLength(1);
  });

  it('gives the timer lock to one tab and lets it expire', async () => {
    const { shouldTakeoverLock, claimTimerLock } = await loadModule();
    expect(shouldTakeoverLock(null, 'tab-a', Date.now())).toBe(true);
    expect(shouldTakeoverLock({ tabId: 'tab-a', sessionId: null, updatedAt: Date.now() }, 'tab-a', Date.now())).toBe(true);
    // Fresh lock owned by another tab: stay a follower.
    expect(shouldTakeoverLock({ tabId: 'tab-a', sessionId: 's', updatedAt: Date.now() }, 'tab-b', Date.now())).toBe(false);
    // Expired lock: safe to take over (crashed tab).
    expect(
      shouldTakeoverLock({ tabId: 'tab-a', sessionId: 's', updatedAt: Date.now() - 60_000 }, 'tab-b', Date.now())
    ).toBe(true);

    expect(claimTimerLock('tab-a', 'sess-1')).toBe(true);
    expect(claimTimerLock('tab-b', 'sess-1')).toBe(false);
  });

  it('hands out a stable device id per browser', async () => {
    const { getDeviceId } = await loadModule();
    const first = getDeviceId();
    const second = getDeviceId();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it('stores anonymous segments locally with dedupe', async () => {
    const { saveAnonymousSegment, getAnonymousSegments, getAnonymousSeconds } = await loadModule();
    const seg = {
      segmentId: 'anon-1#1', sessionId: 'anon-1', mode: 'stopwatch' as const, subjectId: null,
      subjectName: 'Physics', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 90, completed: false,
    };
    saveAnonymousSegment(seg);
    saveAnonymousSegment(seg); // e.g. pagehide + recovery racing
    expect(getAnonymousSegments()).toHaveLength(1);
    expect(getAnonymousSeconds()).toBe(90);
  });

  it('migrates anonymous segments with stable ids and clears only acked ones', async () => {
    const { saveAnonymousSegment, migrateAnonymousSegments, getAnonymousSegments } = await loadModule();
    const mk = (n: number) => ({
      segmentId: `mig#${n}`, sessionId: 'mig', mode: 'stopwatch' as const, subjectId: null,
      subjectName: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 60, completed: false,
    });
    saveAnonymousSegment(mk(1));
    saveAnonymousSegment(mk(2));

    fetchMock.mockImplementation((url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      return Promise.resolve(new Response(JSON.stringify(okAck(body.segmentId, body.durationSeconds)), { status: 200 }));
    });

    const seen: string[] = [];
    const result = await migrateAnonymousSegments((ack) => {
      seen.push(ack.segmentId);
    });
    expect(result).toEqual({ migrated: 2, failed: 0 });
    // Stable ids preserved across the migration (server dedupe keys intact).
    const sentBodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(sentBodies.map((b) => b.segmentId).sort()).toEqual(['mig#1', 'mig#2']);
    expect(seen.sort()).toEqual(['mig#1', 'mig#2']);
    expect(getAnonymousSegments()).toHaveLength(0);
  });

  it('keeps anonymous data when migration hits auth failure (not yet signed in)', async () => {
    const { saveAnonymousSegment, migrateAnonymousSegments, getAnonymousSegments } = await loadModule();
    saveAnonymousSegment({
      segmentId: 'mig-auth#1', sessionId: 'mig-auth', mode: 'stopwatch' as const, subjectId: null,
      subjectName: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 60, completed: false,
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Unauthenticated' }), { status: 401 })
    );
    const result = await migrateAnonymousSegments();
    expect(result.migrated).toBe(0);
    expect(result.failed).toBe(1);
    // Never wipe anonymous history on sign-in failure.
    expect(getAnonymousSegments()).toHaveLength(1);
  });

  it('keeps anonymous data on transient failure but drops only invalid entries', async () => {
    const { saveAnonymousSegment, migrateAnonymousSegments, getAnonymousSegments } = await loadModule();
    saveAnonymousSegment({
      segmentId: 'mig-net#1', sessionId: 'mig-net', mode: 'stopwatch' as const, subjectId: null,
      subjectName: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 600, completed: false,
    });
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const retry = await migrateAnonymousSegments();
    expect(retry.failed).toBe(1);
    expect(getAnonymousSegments()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'bad payload' }), { status: 422 })
    );
    const invalid = await migrateAnonymousSegments();
    expect(invalid.failed).toBe(1);
    // One definitively-invalid entry is dropped so it can never block the rest.
    expect(getAnonymousSegments()).toHaveLength(0);
  });

  it('groups anonymous segments into session history entries', async () => {
    const { saveAnonymousSegment, groupAnonymousHistory } = await loadModule();
    const base = { sessionId: 'g1', mode: 'pomodoro' as const, subjectId: null, subjectName: 'Maths' };
    saveAnonymousSegment({ ...base, segmentId: 'g1#1', startedAt: new Date(Date.now() - 3000_000).toISOString(), endedAt: new Date(Date.now() - 2000_000).toISOString(), durationSeconds: 1000, completed: false });
    saveAnonymousSegment({ ...base, segmentId: 'g1#2', startedAt: new Date(Date.now() - 2000_000).toISOString(), endedAt: new Date(Date.now() - 1000_000).toISOString(), durationSeconds: 1000, completed: true });
    saveAnonymousSegment({ ...base, sessionId: 'g2', segmentId: 'g2#1', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationSeconds: 60, completed: false });
    const history = groupAnonymousHistory();
    expect(history).toHaveLength(2);
    const first = history.find((h) => h.sessionId === 'g1')!;
    // Twenty checkpoint rows would collapse here: 2 segments -> 1 entry.
    expect(first.durationSeconds).toBe(2000);
    expect(first.segmentCount).toBe(2);
    expect(first.completed).toBe(true);
    expect(first.subjectName).toBe('Maths');
  });

  it('derives stable client grouping keys for raw session rows', async () => {
    const { clientSessionGroupKey } = await loadModule();
    expect(clientSessionGroupKey({ id: 'r1', segmentId: 'sess#3' })).toBe('sess');
    expect(clientSessionGroupKey({ id: 'r2', segmentId: null })).toBe('r2');
    expect(clientSessionGroupKey({ id: 'r3' })).toBe('r3');
  });
});
