import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/server/xp';
import { recordStudySegment } from '@/lib/server/study';

interface SubmitStudyBody {
  durationSeconds?: number;
  subjectId?: string;
  subjectName?: string;
  timerType?: 'pomodoro' | 'countdown' | 'stopwatch' | 'other';
  sessionId?: string;
  startedAt?: string;
  segmentId?: string;
}

/**
 * Legacy-compatible wrapper around the canonical study pipeline.
 * Delegates to the same recordStudySegment() implementation used by
 * POST /api/study/sessions/complete so there is exactly one authoritative
 * path for recording study time and awarding XP.
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

    const body: SubmitStudyBody = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const mode =
      body.timerType === 'pomodoro' || body.timerType === 'countdown' || body.timerType === 'stopwatch'
        ? body.timerType
        : 'custom';

    const result = await recordStudySegment(userId, {
      sessionId: body.sessionId,
      segmentId: body.segmentId ?? body.sessionId,
      mode,
      subjectId: body.subjectId ?? null,
      subjectName: body.subjectName ?? null,
      startedAt: body.startedAt,
      durationSeconds: body.durationSeconds,
      completed: true,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      duplicate: result.duplicate,
      session: {
        id: result.sessionId,
        durationSeconds: result.recordedSeconds,
        xpEarned: result.awardedXp,
      },
      stats: {
        totalStudySeconds: result.stats.totalStudySeconds,
        todayStudySeconds: result.stats.todayStudySeconds,
        weekStudySeconds: result.stats.weekStudySeconds,
        monthStudySeconds: result.stats.monthStudySeconds,
        xp: result.stats.totalXp,
        level: result.stats.level,
      },
    });
  } catch (error) {
    console.error('Study submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit study time' },
      { status: 500 }
    );
  }
}
