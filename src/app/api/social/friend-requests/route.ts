import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const direction = searchParams.get('direction') || 'both';

    const incoming: Array<Record<string, unknown>> = [];
    const outgoing: Array<Record<string, unknown>> = [];

    if (direction === 'incoming' || direction === 'both') {
      const { results } = await db.prepare(`
        SELECT fr.*, u.username, p.display_name, p.avatar_url, p.xp, p.level
        FROM friend_requests fr
        JOIN users u ON u.id = fr.from_user_id
        LEFT JOIN user_profiles p ON p.user_id = fr.from_user_id
        WHERE fr.to_user_id = ? AND fr.status = 'pending'
        ORDER BY fr.created_at DESC
      `).bind(userId).all();

      for (const r of results) {
        incoming.push({
          id: r.id,
          fromUserId: r.from_user_id,
          toUserId: r.to_user_id,
          message: r.message,
          status: r.status,
          createdAt: r.created_at,
          fromProfile: {
            id: r.from_user_id,
            username: r.username,
            displayName: r.display_name || r.username,
            avatarUrl: r.avatar_url,
            xp: r.xp || 0,
            level: r.level || 1,
          },
        });
      }
    }

    if (direction === 'outgoing' || direction === 'both') {
      const { results } = await db.prepare(`
        SELECT fr.*, u.username, p.display_name, p.avatar_url, p.xp, p.level
        FROM friend_requests fr
        JOIN users u ON u.id = fr.to_user_id
        LEFT JOIN user_profiles p ON p.user_id = fr.to_user_id
        WHERE fr.from_user_id = ? AND fr.status = 'pending'
        ORDER BY fr.created_at DESC
      `).bind(userId).all();

      for (const r of results) {
        outgoing.push({
          id: r.id,
          fromUserId: r.from_user_id,
          toUserId: r.to_user_id,
          message: r.message,
          status: r.status,
          createdAt: r.created_at,
          toProfile: {
            id: r.to_user_id,
            username: r.username,
            displayName: r.display_name || r.username,
            avatarUrl: r.avatar_url,
            xp: r.xp || 0,
            level: r.level || 1,
          },
        });
      }
    }

    return NextResponse.json({ incoming, outgoing });
  } catch (error) {
    console.error('Friend requests GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
