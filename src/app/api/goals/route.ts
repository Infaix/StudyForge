import { NextRequest, NextResponse } from 'next/server';
import { getGoalProgress, createStudyGoal, requireCurrentUser } from '@/lib/server/goals';

/**
 * Study Goals API.
 *
 * GET  /api/goals?tz=...
 *   Returns every stored goal WITH its progress against the current calendar
 *   week (derived from the canonical timezone-aware statistics — never a
 *   separate counter) plus a supportive recommendation.
 *
 * POST /api/goals
 *   Create an overall goal (subjectId null) or a per-subject goal.
 *   targetSeconds is validated server-side; subject ownership is enforced;
 *   duplicate slots are rejected by the schema.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireCurrentUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tz = searchParams.get('tz') ?? 'UTC';

    const result = await getGoalProgress(userId, { timeZone: tz });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Study goals GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireCurrentUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const result = await createStudyGoal(userId, body);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ success: true, goal: result.goal }, { status: 201 });
  } catch (error) {
    console.error('Study goals POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create goal' }, { status: 500 });
  }
}