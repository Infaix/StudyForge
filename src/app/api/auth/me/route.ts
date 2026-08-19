import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getSessionFromRequest } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const { env } = getCloudflareContext();
    const db = env.DATABASE;

    const profile = await db.prepare(`
      SELECT u.id, u.email, u.username, u.created_at,
             p.display_name, p.avatar_url, p.bio, p.xp, p.level, p.streak,
             p.study_time_today, p.study_time_this_week, p.study_time_this_month, p.study_time_all_time,
             p.privacy_profile_public, p.privacy_show_stats, p.privacy_show_activity,
             p.privacy_show_leaderboard_stats, p.privacy_show_subjects,
             p.updated_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ?
    `).bind(session.userId).first();

    if (!profile) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const { results: friendResults } = await db.prepare(`
      SELECT CASE WHEN user_id_1 = ? THEN user_id_2 ELSE user_id_1 END as friend_id
      FROM friendships WHERE user_id_1 = ? OR user_id_2 = ?
    `).bind(session.userId, session.userId, session.userId).all();

    const { results: incomingResults } = await db.prepare(
      'SELECT from_user_id FROM friend_requests WHERE to_user_id = ? AND status = ?'
    ).bind(session.userId, 'pending').all();

    const { results: outgoingResults } = await db.prepare(
      'SELECT to_user_id FROM friend_requests WHERE from_user_id = ? AND status = ?'
    ).bind(session.userId, 'pending').all();

    const { results: groupResults } = await db.prepare(
      'SELECT group_id FROM group_members WHERE user_id = ?'
    ).bind(session.userId).all();

    const { results: achievementResults } = await db.prepare(
      'SELECT achievement_id FROM user_achievements WHERE user_id = ?'
    ).bind(session.userId).all();

    const user = {
      id: profile.id as string,
      username: profile.username as string,
      displayName: (profile.display_name as string) || (profile.username as string),
      avatarUrl: profile.avatar_url as string | null,
      bio: (profile.bio as string) || '',
      xp: (profile.xp as number) || 0,
      level: (profile.level as number) || 1,
      streak: (profile.streak as number) || 0,
      studyTimeToday: (profile.study_time_today as number) || 0,
      studyTimeThisWeek: (profile.study_time_this_week as number) || 0,
      studyTimeThisMonth: (profile.study_time_this_month as number) || 0,
      studyTimeAllTime: (profile.study_time_all_time as number) || 0,
      friends: friendResults.map((r) => (r as Record<string, string>).friend_id),
      friendRequestsReceived: incomingResults.map((r) => (r as Record<string, string>).from_user_id),
      friendRequestsSent: outgoingResults.map((r) => (r as Record<string, string>).to_user_id),
      groups: groupResults.map((r) => (r as Record<string, string>).group_id),
      achievements: achievementResults.map((r) => (r as Record<string, string>).achievement_id),
      privacy: {
        profilePublic: Boolean(profile.privacy_profile_public),
        showStats: Boolean(profile.privacy_show_stats),
        showActivity: Boolean(profile.privacy_show_activity),
        showLeaderboardStats: Boolean(profile.privacy_show_leaderboard_stats),
        showSubjects: Boolean(profile.privacy_show_subjects),
      },
      createdAt: profile.created_at as string,
      updatedAt: (profile.updated_at as string) || (profile.created_at as string),
    };

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Auth/me error:', error);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
