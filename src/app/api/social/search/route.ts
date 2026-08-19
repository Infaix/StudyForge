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

    return NextResponse.json(results.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name || r.username,
      avatarUrl: r.avatar_url,
      bio: r.bio || '',
      xp: r.xp || 0,
      level: r.level || 1,
    })));
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
