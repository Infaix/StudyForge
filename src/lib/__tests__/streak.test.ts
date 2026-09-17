import { describe, it, expect } from 'vitest';
import { computeStreakInfo } from '../streak';

type Row = { start_time: string };

describe('computeStreakInfo — timezone & calendar behaviour', () => {
  it('returns the empty shape for no rows', () => {
    expect(computeStreakInfo([])).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      totalStudyDays: 0,
      daysSinceLastStudy: 9999,
    });
  });

  it('safes the streak until the local day completes (yesterday counts)', () => {
    const rows: Row[] = [{ start_time: '2026-03-10T12:00:00Z' }];
    const info = computeStreakInfo(rows, { timeZone: 'UTC', now: '2026-03-11T08:00:00Z' });
    expect(info.currentStreak).toBe(1);
    expect(info.lastStudyDate).toBe('2026-03-10');
    expect(info.daysSinceLastStudy).toBe(1);
  });

  it('treats the same instant as a different calendar day in UTC vs Sydney', () => {
    const rows: Row[] = [{ start_time: '2026-03-11T14:30:00Z' }]; // 2026-03-11 UTC, 2026-03-12 AEDT
    const now = '2026-03-12T10:00:00Z';

    const utc = computeStreakInfo(rows, { timeZone: 'UTC', now });
    expect(utc.lastStudyDate).toBe('2026-03-11');
    expect(utc.daysSinceLastStudy).toBe(1);

    const sydney = computeStreakInfo(rows, { timeZone: 'Australia/Sydney', now });
    expect(sydney.lastStudyDate).toBe('2026-03-12');
    expect(sydney.daysSinceLastStudy).toBe(0);
  });

  it('counts three consecutive days identically in UTC and Sydney by local calendar', () => {
    const rows: Row[] = [
      { start_time: '2026-03-09T14:30:00Z' },
      { start_time: '2026-03-10T14:30:00Z' },
      { start_time: '2026-03-11T14:30:00Z' },
    ];
    const now = '2026-03-11T15:00:00Z';

    const utc = computeStreakInfo(rows, { timeZone: 'UTC', now });
    expect(utc.currentStreak).toBe(3);
    expect(utc.totalStudyDays).toBe(3);

    const sydney = computeStreakInfo(rows, { timeZone: 'Australia/Sydney', now });
    expect(sydney.currentStreak).toBe(3);
    expect(sydney.totalStudyDays).toBe(3);
  });

  it('keeps a streak continuous across the US spring-forward DST transition', () => {
    const rows: Row[] = [
      { start_time: '2026-03-07T06:30:00Z' }, // 03-07 01:30 EST
      { start_time: '2026-03-08T06:30:00Z' }, // 03-08 02:30 EDT (spring forward at 02:00)
      { start_time: '2026-03-09T12:00:00Z' }, // 03-09 08:00 EDT
    ];
    const ny = computeStreakInfo(rows, { timeZone: 'America/New_York', now: '2026-03-09T13:00:00Z' });
    expect(ny.currentStreak).toBe(3);
    expect(ny.longestStreak).toBe(3);
    expect(ny.totalStudyDays).toBe(3);
    expect(ny.lastStudyDate).toBe('2026-03-09');
  });

  it('sees two sessions minutes apart across the lost DST hour as consecutive days', () => {
    const rows: Row[] = [
      { start_time: '2026-03-07T07:00:00Z' }, // 03-07 02:00 EST
      { start_time: '2026-03-08T06:30:00Z' }, // 03-08 02:30 EDT — 90 real minutes later, next local day
    ];
    const ny = computeStreakInfo(rows, { timeZone: 'America/New_York', now: '2026-03-08T12:00:00Z' });
    expect(ny.currentStreak).toBe(2);
    expect(ny.totalStudyDays).toBe(2);
    expect(ny.lastStudyDate).toBe('2026-03-08');
  });

  it('resets the current streak across a gap but keeps the longest run', () => {
    const rows: Row[] = [
      { start_time: '2026-03-06T00:00:00Z' },
      { start_time: '2026-03-07T00:00:00Z' },
      { start_time: '2026-03-10T00:00:00Z' },
    ];
    const info = computeStreakInfo(rows, { timeZone: 'UTC', now: '2026-03-12T12:00:00Z' });
    expect(info.currentStreak).toBe(0);
    expect(info.longestStreak).toBe(2);
    expect(info.totalStudyDays).toBe(3);
    expect(info.lastStudyDate).toBe('2026-03-10');
    expect(info.daysSinceLastStudy).toBe(2);
  });

  it('skips rows with unparseable start_time', () => {
    const rows: Row[] = [{ start_time: 'not-a-date' }, { start_time: '2026-03-10T05:00:00Z' }];
    const info = computeStreakInfo(rows, { timeZone: 'UTC', now: '2026-03-10T10:00:00Z' });
    expect(info.totalStudyDays).toBe(1);
    expect(info.currentStreak).toBe(1);
    expect(info.lastStudyDate).toBe('2026-03-10');
  });

  it('falls back to UTC for an invalid timezone name', () => {
    const rows: Row[] = [{ start_time: '2026-03-10T05:00:00Z' }];
    const info = computeStreakInfo(rows, { timeZone: 'Mars/Olympus', now: '2026-03-10T10:00:00Z' });
    expect(info.currentStreak).toBe(1);
    expect(info.lastStudyDate).toBe('2026-03-10');
  });

  it('accepts "now" as a numeric epoch', () => {
    const rows: Row[] = [{ start_time: '2026-01-01T00:00:00Z' }];
    const info = computeStreakInfo(rows, {
      timeZone: 'UTC',
      now: new Date('2026-01-01T10:00:00Z').getTime(),
    });
    expect(info.currentStreak).toBe(1);
  });
});