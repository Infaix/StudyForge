import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/server/xp';
import { getUserStudyStats, getCrossDeviceWarning } from '@/lib/server/study';

/**
 * Authoritative study statistics for the authenticated user.
 * All values are derived from D1 (study_sessions + user_profiles), never from
 * localStorage or client state. Used by refreshUserStats() across the UI.
 *
 * Query params:
 * - tz: IANA timezone name (e.g. Australia/Melbourne) so Today/Week/Month
 *   follow the user's local calendar instead of UTC.
 * - deviceId: stable per-browser id; when supplied the response also carries
 *   a non-destructive cross-device warning if another device recently synced.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tz = searchParams.get('tz') || 'UTC';
    const deviceId = searchParams.get('deviceId');

    const stats = await getUserStudyStats(userId, { timeZone: tz });
    const crossDevice = await getCrossDeviceWarning(userId, deviceId);
    return NextResponse.json({ success: true, stats, crossDevice });
  } catch (error) {
    console.error('Study stats error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load study stats' }, { status: 500 });
  }
}
