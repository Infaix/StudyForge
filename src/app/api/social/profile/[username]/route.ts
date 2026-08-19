import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  try {
    const db = getDB();

    const profile = await db.prepare(`
      SELECT u.id, u.username, u.email, u.created_at,
             p.display_name, p.avatar_url, p.bio, p.xp, p.level, p.streak,
             p.study_time_today, p.study_time_this_week, p.study_time_this_month, p.study_time_all_time,
             p.privacy_profile_public, p.privacy_show_stats, p.privacy_show_activity,
             p.privacy_show_leaderboard_stats, p.privacy_show_subjects,
             p.updated_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.username = ?
    `).bind(username).first();

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { results: achievementResults } = await db.prepare(
      'SELECT achievement_id FROM user_achievements WHERE user_id = ?'
    ).bind(profile.id).all();

    const user = {
      id: profile.id,
      username: profile.username,
      displayName: (profile.display_name as string) || (profile.username as string),
      avatarUrl: profile.avatar_url,
      bio: (profile.bio as string) || '',
      xp: (profile.xp as number) || 0,
      level: (profile.level as number) || 1,
      streak: (profile.streak as number) || 0,
      studyTimeToday: (profile.study_time_today as number) || 0,
      studyTimeThisWeek: (profile.study_time_this_week as number) || 0,
      studyTimeThisMonth: (profile.study_time_this_month as number) || 0,
      studyTimeAllTime: (profile.study_time_all_time as number) || 0,
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
    console.error('Profile lookup error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
