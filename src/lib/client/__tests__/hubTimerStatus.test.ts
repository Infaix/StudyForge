import { describe, it, expect } from 'vitest';
import {
  getHubActiveTimerStatus,
  type ActiveTimerSnapshot,
  type TimerLock,
} from '../studySubmission';

function makeSnapshot(partial: Partial<ActiveTimerSnapshot> = {}): ActiveTimerSnapshot {
  return {
    sessionId: 'sess-1',
    mode: 'stopwatch',
    subjectId: null,
    subjectName: null,
    recordedSeconds: 120,
    runStartedAt: 1000,
    segStartIso: null,
    paused: false,
    savedAt: Date.now(),
    ...partial,
  };
}

const now = 10_000;
const tabId = 'tab-a';

function lock(partial: Partial<TimerLock> = {}): TimerLock {
  return { tabId: 'tab-b', sessionId: null, updatedAt: now - 1000, ...partial };
}

describe('getHubActiveTimerStatus', () => {
  it('reports none when there is no snapshot', () => {
    const r = getHubActiveTimerStatus(null, { now, tabId, lock: null });
    expect(r.state).toBe('none');
    expect(r.elapsedSeconds).toBe(0);
  });

  it('reports active with live elapsed for an open run', () => {
    const r = getHubActiveTimerStatus(makeSnapshot({ runStartedAt: 5000 }), { now, tabId, lock: null });
    expect(r.state).toBe('active');
    expect(r.elapsedSeconds).toBe(5);
    expect(r.totalSeconds).toBe(125); // 120 recorded + 5 live
  });

  it('reports paused with no live elapsed', () => {
    const r = getHubActiveTimerStatus(
      makeSnapshot({ runStartedAt: null, paused: true }),
      { now, tabId, lock: null }
    );
    expect(r.state).toBe('paused');
    expect(r.elapsedSeconds).toBe(0);
    expect(r.totalSeconds).toBe(120);
  });

  it('reports other-tab when another tab owns the lock recently', () => {
    const r = getHubActiveTimerStatus(
      makeSnapshot({ runStartedAt: 5000 }),
      { now: 10_500, tabId, lock: lock({ updatedAt: 10_200 }) }
    );
    expect(r.state).toBe('other-tab');
  });

  it('ignores an expired lock from another tab', () => {
    const r = getHubActiveTimerStatus(
      makeSnapshot({ runStartedAt: 5000 }),
      { now, tabId, lock: lock({ updatedAt: now - 20_000 }) }
    );
    expect(r.state).toBe('active');
  });

  it('does not report other-tab for the same tab id', () => {
    const r = getHubActiveTimerStatus(
      makeSnapshot({ runStartedAt: 5000 }),
      { now: 10_500, tabId, lock: lock({ tabId, updatedAt: 10_200 }) }
    );
    expect(r.state).toBe('active');
  });

  it('reports recovered when the snapshot was just recovered', () => {
    const r = getHubActiveTimerStatus(
      makeSnapshot({ runStartedAt: 5000, recovered: true }),
      { now, tabId, lock: null }
    );
    expect(r.state).toBe('recovered');
  });

  it('treats a stale open run as none', () => {
    const r = getHubActiveTimerStatus(
      makeSnapshot({ runStartedAt: now - (13 * 3600 + 1) * 1000 }),
      { now, tabId, lock: null }
    );
    expect(r.state).toBe('none');
  });

  it('treats a stale snapshot (savedAt too old) as none even when paused', () => {
    const r = getHubActiveTimerStatus(
      makeSnapshot({ runStartedAt: null, paused: true, savedAt: now - 14 * 3600 * 1000 }),
      { now, tabId, lock: null }
    );
    expect(r.state).toBe('none');
  });
});