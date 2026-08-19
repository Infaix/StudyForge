import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { results } = await db.prepare(`
      SELECT CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END as friend_id,
             u.username, p.display_name, p.avatar_url, p.xp, p.level, p.streak, p.study_time_all_time
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE f.user_id_1 = ? OR f.user_id_2 = ?
    `).bind(userId, userId, userId, userId).all();

    return NextResponse.json(results.map((f) => {
      const row = f as Record<string, unknown>;
      return {
        id: row.friend_id,
        username: row.username,
        displayName: row.display_name || row.username,
        avatarUrl: row.avatar_url,
        xp: (row.xp as number) || 0,
        level: (row.level as number) || 1,
        streak: (row.streak as number) || 0,
        studyTime: (row.study_time_all_time as number) || 0,
      };
    }));
  } catch (error) {
    console.error('Friends GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch friends' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { toUserId, action } = await request.json();

    if (action === 'request') {
      if (!toUserId) return NextResponse.json({ error: 'toUserId required' }, { status: 400 });

      const existing = await db.prepare(`
        SELECT id FROM friend_requests
        WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
        AND status = 'pending'
      `).bind(userId, toUserId, toUserId, userId).first();
      if (existing) return NextResponse.json({ error: 'Request already pending' }, { status: 409 });

      const alreadyFriends = await db.prepare(`
        SELECT 1 FROM friendships WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)
      `).bind(userId < toUserId ? userId : toUserId, userId < toUserId ? toUserId : userId, toUserId < userId ? toUserId : userId, toUserId < userId ? userId : toUserId).first();
      if (alreadyFriends) return NextResponse.json({ error: 'Already friends' }, { status: 409 });

      const id = crypto.randomUUID();
      await db.prepare(
        'INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, userId, toUserId, 'pending', new Date().toISOString()).run();

      return NextResponse.json({ ok: true, requestId: id });
    }

    if (action === 'accept') {
      const { requestId } = await request.json();
      if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });

      const requestRow = await db.prepare(
        'SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = ?'
      ).bind(requestId, userId, 'pending').first<Record<string, unknown>>();
      if (!requestRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

      const fromUserId = requestRow.from_user_id as string;
      const user1 = userId < fromUserId ? userId : fromUserId;
      const user2 = userId < fromUserId ? fromUserId : userId;
      const now = new Date().toISOString();

      await db.batch([
        db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').bind('accepted', requestId),
        db.prepare('INSERT OR IGNORE INTO friendships (user_id_1, user_id_2, created_at) VALUES (?, ?, ?)').bind(user1, user2, now),
      ]);

      return NextResponse.json({ ok: true });
    }

    if (action === 'decline') {
      const { requestId } = await request.json();
      await db.prepare('UPDATE friend_requests SET status = ? WHERE id = ? AND to_user_id = ?').bind('declined', requestId, userId).run();
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove') {
      const { friendId } = await request.json();
      if (!friendId) return NextResponse.json({ error: 'friendId required' }, { status: 400 });

      const user1 = userId < friendId ? userId : friendId;
      const user2 = userId < friendId ? friendId : userId;
      await db.prepare('DELETE FROM friendships WHERE user_id_1 = ? AND user_id_2 = ?').bind(user1, user2).run();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Friends error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
