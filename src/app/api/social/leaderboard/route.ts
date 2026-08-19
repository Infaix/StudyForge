import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'xp';
    const period = searchParams.get('period') || 'all-time';
    const friendsOnly = searchParams.get('friends') === 'true';

    let timeCondition = '';
    if (period === 'this-week') {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      timeCondition = `AND ss.start_time >= '${weekAgo}'`;
    } else if (period === 'this-month') {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      timeCondition = `AND ss.start_time >= '${monthAgo}'`;
    }

    let leaderboard: Array<Record<string, unknown>> = [];

    if (category === 'xp') {
      let sql = `
        SELECT u.id, u.username, p.display_name, p.avatar_url, p.xp, p.level, p.streak,
               p.study_time_all_time as study_time, p.privacy_show_leaderboard_stats
        FROM user_profiles p
        JOIN users u ON u.id = p.user_id
        WHERE 1=1
      `;
      if (friendsOnly && userId) {
        sql += ` AND (p.user_id IN (
          SELECT CASE WHEN user_id_1 = ? THEN user_id_2 ELSE user_id_1 END
          FROM friendships WHERE user_id_1 = ? OR user_id_2 = ?
        ) OR p.user_id = ?)`;
        const { results } = await db.prepare(sql + ' ORDER BY p.xp DESC LIMIT 50').bind(userId, userId, userId, userId).all();
        leaderboard = results;
      } else {
        const { results } = await db.prepare(sql + ' ORDER BY p.xp DESC LIMIT 50').all();
        leaderboard = results;
      }
    } else if (category === 'studyTime') {
      let sql = `
        SELECT u.id, u.username, p.display_name, p.avatar_url, p.xp, p.level, p.streak,
               COALESCE(SUM(ss.duration), 0) as study_time, p.privacy_show_leaderboard_stats
        FROM user_profiles p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN study_sessions ss ON ss.user_id = p.user_id ${timeCondition}
        WHERE 1=1
      `;
      if (friendsOnly && userId) {
        sql += ` AND (p.user_id IN (
          SELECT CASE WHEN user_id_1 = ? THEN user_id_2 ELSE user_id_1 END
          FROM friendships WHERE user_id_1 = ? OR user_id_2 = ?
        ) OR p.user_id = ?)`;
        sql += ' GROUP BY p.user_id ORDER BY study_time DESC LIMIT 50';
        const { results } = await db.prepare(sql).bind(userId, userId, userId, userId).all();
        leaderboard = results;
      } else {
        sql += ' GROUP BY p.user_id ORDER BY study_time DESC LIMIT 50';
        const { results } = await db.prepare(sql).all();
        leaderboard = results;
      }
    } else if (category === 'streak') {
      let sql = `
        SELECT u.id, u.username, p.display_name, p.avatar_url, p.xp, p.level, p.streak,
               p.study_time_all_time as study_time, p.privacy_show_leaderboard_stats
        FROM user_profiles p
        JOIN users u ON u.id = p.user_id
        WHERE 1=1
      `;
      if (friendsOnly && userId) {
        sql += ` AND (p.user_id IN (
          SELECT CASE WHEN user_id_1 = ? THEN user_id_2 ELSE user_id_1 END
          FROM friendships WHERE user_id_1 = ? OR user_id_2 = ?
        ) OR p.user_id = ?)`;
        const { results } = await db.prepare(sql + ' ORDER BY p.streak DESC LIMIT 50').bind(userId, userId, userId, userId).all();
        leaderboard = results;
      } else {
        const { results } = await db.prepare(sql + ' ORDER BY p.streak DESC LIMIT 50').all();
        leaderboard = results;
      }
    }

    const entries = leaderboard
      .filter((r) => r.privacy_show_leaderboard_stats || r.id === userId)
      .map((r, i) => ({
        rank: i + 1,
        profile: {
          id: r.id,
          username: r.username,
          displayName: r.display_name || r.username,
          avatarUrl: r.avatar_url,
          level: r.level || 1,
        },
        xp: r.xp || 0,
        studyTime: r.study_time || 0,
        streak: r.streak || 0,
        isCurrentUser: r.id === userId,
      }));

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
