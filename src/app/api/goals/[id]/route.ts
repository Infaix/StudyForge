import { NextRequest, NextResponse } from 'next/server';
import { updateStudyGoal, deleteStudyGoal, requireCurrentUser } from '@/lib/server/goals';

/**
 * Per-goal mutations.
 *
 * PUT    /api/goals/[id]  — update target/subject/enabled (server-validated).
 * DELETE /api/goals/[id]  — remove the goal entirely.
 *
 * Ownership is enforced in SQL (`id = ? AND user_id = ?`) and via an explicit
 * owner check — a client can never touch someone else's goal.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const userId = await requireCurrentUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }
    const { id } = await params;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const result = await updateStudyGoal(userId, id, body);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ success: true, goal: result.goal });
  } catch (error) {
    console.error('Study goals PUT error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const userId = await requireCurrentUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }
    const { id } = await params;

    const result = await deleteStudyGoal(userId, id);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Study goals DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete goal' }, { status: 500 });
  }
}