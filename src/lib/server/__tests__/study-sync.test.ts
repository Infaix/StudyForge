import { describe, it, expect } from 'vitest';
import {
  validateSegmentInput,
  sessionGroupKey,
  getZonedDayBounds,
  zonedDateKey,
  zonedMidnightToUtcMs,
} from '../study';

describe('validateSegmentInput device identity', () => {
  const base = {
    segmentId: 'sess-1#2',
    sessionId: 'sess-1',
    mode: 'stopwatch',
    durationSeconds: 300,
    startedAt: new Date(Date.now() - 300_000).toISOString(),
    endedAt: new Date().toISOString(),
  };

  it('accepts and trims a deviceId', () => {
    const result = validateSegmentInput({ ...base, deviceId: '  device-abc  ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deviceId).toBe('device-abc');
  });

  it('defaults a missing deviceId to null (anonymous/legacy clients)', () => {
    const result = validateSegmentInput(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deviceId).toBeNull();
  });
});

describe('sessionGroupKey (history grouping)', () => {
  it('prefers the stored session_id column', () => {
    expect(sessionGroupKey({ session_id: 'sess-9', segment_id: 'other#1', id: 'row-1' })).toBe('sess-9');
  });

  it('falls back to the segment_id prefix for pre-migration rows', () => {
    expect(sessionGroupKey({ session_id: null, segment_id: 'sess-4#3', id: 'row-2' })).toBe('sess-4');
    expect(sessionGroupKey({ session_id: null, segment_id: 'sess-4#p-1700000000', id: 'row-3' })).toBe('sess-4');
  });

  it('falls back to the row id for legacy rows without a convention id', () => {
    expect(sessionGroupKey({ session_id: null, segment_id: null, id: 'row-9' })).toBe('row-9');
    expect(sessionGroupKey({ session_id: null, segment_id: 'bare-id', id: 'row-10' })).toBe('row-10');
  });

  it('groups checkpoint + orphan chunks of one run together', () => {
    const keys = new Set([
      sessionGroupKey({ session_id: 'run-1', segment_id: 'run-1#1', id: 'a' }),
      sessionGroupKey({ session_id: 'run-1', segment_id: 'run-1#2', id: 'b' }),
      sessionGroupKey({ session_id: null, segment_id: 'run-1#p-1700000000', id: 'c' }),
    ]);
    // The first two share the stored session_id; the orphan chunk resolves
    // via its prefix to the same logical run.
    expect(keys.has('run-1')).toBe(true);
  });
});

describe('timezone-aware day boundaries', () => {
  it('starts today at UTC midnight for UTC', () => {
    const nowMs = Date.UTC(2026, 4, 10, 15, 30, 0); // 2026-05-10 15:30 UTC (a Sunday)
    const bounds = getZonedDayBounds(nowMs, 'UTC');
    expect(bounds.todayStartIso).toBe('2026-05-10T00:00:00.000Z');
    expect(bounds.monthStartIso).toBe('2026-05-01T00:00:00.000Z');
    // Monday-start week: Sunday 2026-05-10 belongs to week starting Mon 2026-05-04.
    expect(bounds.weekStartIso).toBe('2026-05-04T00:00:00.000Z');
  });

  it('shifts the day boundary for Australia/Sydney (UTC+10/+11)', () => {
    // 2026-05-10 05:00 UTC = 2026-05-10 15:00 Sydney (AEST, +10 in May).
    // A segment at 2026-05-10 00:30 UTC is still "yesterday" in Sydney.
    const nowMs = Date.UTC(2026, 4, 10, 5, 0, 0);
    const bounds = getZonedDayBounds(nowMs, 'Australia/Sydney');
    expect(bounds.todayStartIso).toBe('2026-05-09T14:00:00.000Z'); // Sydney midnight = 14:00Z prior day
    expect(zonedDateKey(nowMs, 'Australia/Sydney')).toBe('2026-05-10');
    expect(zonedDateKey(Date.UTC(2026, 4, 10, 0, 30, 0), 'Australia/Sydney')).toBe('2026-05-10');
    expect(zonedDateKey(Date.UTC(2026, 4, 9, 13, 59, 0), 'Australia/Sydney')).toBe('2026-05-09');
  });

  it('handles US day boundaries behind UTC', () => {
    // 2026-05-10 03:00 UTC = 2026-05-09 23:00 New York (EDT, -4 in May).
    expect(zonedDateKey(Date.UTC(2026, 4, 10, 3, 0, 0), 'America/New_York')).toBe('2026-05-09');
    const bounds = getZonedDayBounds(Date.UTC(2026, 4, 10, 3, 0, 0), 'America/New_York');
    expect(bounds.todayStartIso).toBe('2026-05-09T04:00:00.000Z');
  });

  it('falls back to UTC for invalid timezone names', () => {
    const nowMs = Date.UTC(2026, 4, 10, 15, 30, 0);
    const bounds = getZonedDayBounds(nowMs, 'Not/AZone');
    expect(bounds.todayStartIso).toBe('2026-05-10T00:00:00.000Z');
  });

  it('zonedMidnightToUtcMs round-trips through the local calendar', () => {
    for (const tz of ['UTC', 'Australia/Sydney', 'America/New_York', 'Pacific/Kiritimati']) {
      const ms = zonedMidnightToUtcMs(2026, 2, 15, tz);
      expect(zonedDateKey(ms, tz)).toBe('2026-02-15');
      // One second before midnight is still the previous day.
      expect(zonedDateKey(ms - 1000, tz)).toBe('2026-02-14');
    }
  });
});
