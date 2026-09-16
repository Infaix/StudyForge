import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/server/xp';
import { getStudySessionHistory } from '@/lib/server/study';

/**
 * Grouped study-session history backed by persisted segments.
 * Checkpoint segments sharing one studySessionId collapse into a single
 * entry (subject, mode, duration, date, start/end) — the UI never sees
 * twenty separate 20-second rows.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10) || 20));

    const sessions = await getStudySessionHistory(userId, { limit });
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    console.error('Study history error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load study history' }, { status: 500 });
  }
}
