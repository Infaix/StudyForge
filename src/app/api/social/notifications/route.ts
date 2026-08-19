import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json([]);

    const { results } = await db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(userId).all();

    const notifications = results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      message: r.message,
      read: Boolean(r.read),
      relatedId: r.related_id,
      createdAt: r.created_at,
    }));

    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { notificationId, action } = await request.json();

    if (action === 'markRead' && notificationId) {
      await db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').bind(notificationId, userId).run();
    } else if (action === 'markAllRead') {
      await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(userId).run();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Notifications PUT error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
