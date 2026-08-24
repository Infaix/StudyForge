import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/server/xp';
import { getUserStudyStats } from '@/lib/server/study';

/**
 * Authoritative study statistics for the authenticated user.
 * All values are derived from D1 (study_sessions + user_profiles), never from
 * localStorage or client state. Used by refreshUserStats() across the UI.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }

    const stats = await getUserStudyStats(userId);
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Study stats error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load study stats' }, { status: 500 });
  }
}
