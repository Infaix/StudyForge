import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json([]);

    const { results } = await db.prepare(`
      SELECT sa.*, u.username, p.display_name, p.avatar_url
      FROM study_activities sa
      JOIN users u ON u.id = sa.user_id
      LEFT JOIN user_profiles p ON p.user_id = sa.user_id
      WHERE sa.user_id IN (
        SELECT CASE WHEN user_id_1 = ? THEN user_id_2 ELSE user_id_1 END
        FROM friendships WHERE user_id_1 = ? OR user_id_2 = ?
      )
      OR sa.user_id = ?
      ORDER BY sa.created_at DESC
      LIMIT 50
    `).bind(userId, userId, userId, userId).all();

    const activities = results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      description: r.description,
      durationMinutes: r.duration_minutes,
      xpAwarded: r.xp_awarded,
      subjectId: r.subject_id,
      metadata: (() => { try { return JSON.parse(r.metadata as string || '{}'); } catch { return {}; } })(),
      createdAt: r.created_at,
      user: {
        username: r.username,
        displayName: r.display_name || r.username,
        avatarUrl: r.avatar_url,
      },
    }));

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Activities error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
