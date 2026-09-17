export interface LockInMetadata {
  sessionId?: string;
  subjectId: string;
  targetSeconds: number;
  createdAt: number;
}

export function createLockInMetadata(input: Omit<LockInMetadata, 'createdAt'>, now = Date.now()): LockInMetadata {
  return { ...input, createdAt: now };
}

export function parseLockInMetadata(raw: string | null): LockInMetadata | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LockInMetadata>;
    const targetSeconds = value.targetSeconds;
    const createdAt = value.createdAt;
    if (typeof value.subjectId !== 'string' || !value.subjectId || typeof targetSeconds !== 'number' || !Number.isFinite(targetSeconds) || targetSeconds <= 0 || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
    return { sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined, subjectId: value.subjectId, targetSeconds, createdAt };
  } catch { return null; }
}

export function isLockInTargetReached(elapsedSeconds: number, targetSeconds: number): boolean {
  return elapsedSeconds >= targetSeconds;
}
