import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const { results } = await db.prepare(`
      SELECT u.id, u.username, p.display_name, p.avatar_url, p.bio, p.xp, p.level
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE (u.username LIKE ? OR p.display_name LIKE ?)
      AND u.id != ?
      LIMIT 20
    `).bind(`%${query}%`, `%${query}%`, userId || '').all();

    let friendshipIds: string[] = [];
    if (userId) {
      const { results: friendResults } = await db.prepare(`
        SELECT CASE WHEN user_id_1 = ? THEN user_id_2 ELSE user_id_1 END as friend_id
        FROM friendships WHERE user_id_1 = ? OR user_id_2 = ?
      `).bind(userId, userId, userId).all();
      friendshipIds = friendResults.map((r) => (r as Record<string, string>).friend_id);
    }

    const friendSet = new Set(friendshipIds);

    return NextResponse.json(results.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.username,
      avatarUrl: r.avatar_url,
      bio: r.bio || '',
      xp: r.xp || 0,
      level: r.level || 1,
      status: friendSet.has(r.id as string) ? 'friends' : 'none',
    })));
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
