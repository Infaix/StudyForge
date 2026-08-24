import { describe, it, expect } from 'vitest';
import {
  validateSegmentInput,
  computeSegmentXp,
  MIN_SEGMENT_SECONDS,
} from '../study';

describe('validateSegmentInput', () => {
  const base = {
    segmentId: 'session-1#2',
    sessionId: 'session-1',
    mode: 'stopwatch',
    durationSeconds: 300,
    startedAt: new Date(Date.now() - 300_000).toISOString(),
    endedAt: new Date().toISOString(),
  };

  it('accepts a valid segment and normalizes fields', () => {
    const result = validateSegmentInput(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.segmentId).toBe('session-1#2');
    expect(result.value.durationSeconds).toBe(300);
    expect(result.value.completed).toBe(false);
    expect(result.value.mode).toBe('stopwatch');
  });

  it('rejects negative durations', () => {
    expect(validateSegmentInput({ ...base, durationSeconds: -5 }).ok).toBe(false);
  });

  it('rejects zero and missing durations', () => {
    expect(validateSegmentInput({ ...base, durationSeconds: 0 }).ok).toBe(false);
    expect(validateSegmentInput({ ...base, durationSeconds: undefined }).ok).toBe(false);
  });

  it('rejects obviously impossible durations', () => {
    expect(
      validateSegmentInput({ ...base, durationSeconds: 60 * 60 * 24 }).ok
    ).toBe(false);
  });

  it('rejects segments shorter than the minimum', () => {
    const result = validateSegmentInput({ ...base, durationSeconds: MIN_SEGMENT_SECONDS - 1 });
    expect(result.ok).toBe(false);
  });

  it('requires a segment id for idempotency', () => {
    expect(validateSegmentInput({ ...base, segmentId: '', sessionId: '' }).ok).toBe(false);
  });

  it('falls back to sessionId when segmentId is absent', () => {
    const result = validateSegmentInput({ ...base, segmentId: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.segmentId).toBe('session-1');
  });

  it('rejects segment ids with unsafe characters', () => {
    expect(validateSegmentInput({ ...base, segmentId: 'bad id/../x' }).ok).toBe(false);
  });

  it('falls back to custom mode for unknown modes', () => {
    const result = validateSegmentInput({ ...base, mode: 'time-machine' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('custom');
  });

  it('reconstructs timestamps when none are supplied', () => {
    const result = validateSegmentInput({ segmentId: 'a#1', durationSeconds: 120 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const span =
      new Date(result.value.endedAt).getTime() - new Date(result.value.startedAt).getTime();
    expect(Math.round(span / 1000)).toBe(120);
  });

  it('rejects startedAt far in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(validateSegmentInput({ ...base, startedAt: future }).ok).toBe(false);
  });
});

describe('computeSegmentXp (server-authoritative XP)', () => {
  it('awards one XP per completed minute', () => {
    const r = computeSegmentXp({ xp: 0, level: 1, minutesTotal: 0, carrySeconds: 0 }, 300);
    expect(r.awardedXp).toBe(5);
    expect(r.newMinutesTotal).toBe(5);
    expect(r.newCarrySeconds).toBe(0);
  });

  it('carries sub-minute remainders across segments', () => {
    // 50s left over from the last segment plus 30s now = 80s -> 1 minute.
    const r = computeSegmentXp({ xp: 4, level: 1, minutesTotal: 4, carrySeconds: 50 }, 30);
    expect(r.newMinutesTotal).toBe(5);
    expect(r.newCarrySeconds).toBe(20);
    expect(r.awardedXp).toBe(1);
  });

  it('never awards XP for pure sub-minute fragments but keeps them', () => {
    const r = computeSegmentXp({ xp: 9, level: 1, minutesTotal: 9, carrySeconds: 0 }, 45);
    expect(r.awardedXp).toBe(0);
    expect(r.newCarrySeconds).toBe(45);
    expect(r.newMinutesTotal).toBe(9);
  });

  it('crossing a 30-minute lifetime mark awards the bonus exactly once', () => {
    const r = computeSegmentXp({ xp: 29, level: 1, minutesTotal: 29, carrySeconds: 50 }, 40);
    // 90s effective -> 1 minute (total 30), bonus 0 -> 1.
    expect(r.newMinutesTotal).toBe(30);
    expect(r.awardedXp).toBe(2); // 1 minute + 1 milestone bonus
  });

  it('is monotonic: repeated small segments converge to the same totals', () => {
    let state = { xp: 0, level: 1, minutesTotal: 0, carrySeconds: 0 };
    let xp = 0;
    for (let i = 0; i < 12; i++) {
      const r = computeSegmentXp(state, 25); // 25s x 12 = 300s total
      state = { ...state, minutesTotal: r.newMinutesTotal, carrySeconds: r.newCarrySeconds };
      xp += r.awardedXp;
    }
    expect(state.minutesTotal).toBe(5);
    expect(state.carrySeconds).toBe(0);
    expect(xp).toBe(5); // identical to a single 300s segment
  });
});
