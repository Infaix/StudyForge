import { describe, expect, it } from 'vitest';
import { createLockInMetadata, isLockInTargetReached, parseLockInMetadata } from '../lockIn';

describe('Exam Lock-In metadata and target rules', () => {
  it('creates metadata without an elapsed-time counter', () => {
    expect(createLockInMetadata({ sessionId: 's1', subjectId: 'maths', targetSeconds: 3600 }, 123)).toEqual({ sessionId: 's1', subjectId: 'maths', targetSeconds: 3600, createdAt: 123 });
  });
  it('round-trips valid metadata', () => {
    expect(parseLockInMetadata(JSON.stringify({ sessionId: 's1', subjectId: 'physics', targetSeconds: 2700, createdAt: 123 }))).toEqual({ sessionId: 's1', subjectId: 'physics', targetSeconds: 2700, createdAt: 123 });
  });
  it('rejects malformed or unsafe metadata', () => {
    expect(parseLockInMetadata(null)).toBeNull();
    expect(parseLockInMetadata('{bad')).toBeNull();
    expect(parseLockInMetadata(JSON.stringify({ subjectId: '', targetSeconds: 0, createdAt: 1 }))).toBeNull();
    expect(parseLockInMetadata(JSON.stringify({ subjectId: 'maths', targetSeconds: -1, createdAt: 1 }))).toBeNull();
  });
  it('reaches the target at or beyond the selected duration', () => {
    expect(isLockInTargetReached(3599, 3600)).toBe(false);
    expect(isLockInTargetReached(3600, 3600)).toBe(true);
    expect(isLockInTargetReached(4000, 3600)).toBe(true);
  });
});
