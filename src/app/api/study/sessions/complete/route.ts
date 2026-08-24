import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/server/xp';
import { recordStudySegment } from '@/lib/server/study';

interface CompleteStudySessionBody {
  sessionId?: string;
  segmentId?: string;
  mode?: 'stopwatch' | 'countdown' | 'pomodoro' | 'custom';
  subjectId?: string | null;
  subjectName?: string | null;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  /** Back-compat alias used by older clients. */
  duration?: number;
  completed?: boolean;
}

/**
 * Canonical study-time submission endpoint.
 *
 * Every timer mode (stopwatch / countdown / pomodoro / custom) submits each
 * active segment here — on pause, on stop and on natural completion.
 *
 * The server:
 * 1. Resolves the user from the session cookie (never a client-supplied userId).
 * 2. Validates duration/timestamps/segmentId server-side.
 * 3. Enforces idempotency via UNIQUE(segment_id) — retries count once.
 * 4. Calculates XP from validated seconds (1 XP/min + bonus) with sub-minute
 *    carry-over; client-supplied XP is never trusted.
 * 5. Updates authoritative statistics in D1 and returns them so the UI can
 *    display real values immediately.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Sign in to save your study time and earn XP' },
        { status: 401 }
      );
    }

    const body: CompleteStudySessionBody = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const result = await recordStudySegment(userId, body);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Study segment completion error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record study time' },
      { status: 500 }
    );
  }
}
