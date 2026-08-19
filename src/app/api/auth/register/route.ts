import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { hashPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { email, username, password, displayName } = await request.json();

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Email, username, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    if (username.length < 3 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json({ error: 'Username must be 3+ characters (letters, numbers, _, -)' }, { status: 400 });
    }

    const { env } = getCloudflareContext();
    const db = env.DATABASE;

    const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existingEmail) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const existingUsername = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existingUsername) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);

    await db.batch([
      db.prepare('INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, email, username, passwordHash, now, now),
      db.prepare('INSERT INTO user_profiles (user_id, display_name, bio, xp, level, streak, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(userId, displayName || username, '', 0, 1, 0, now, now),
      db.prepare('INSERT INTO user_settings (id, user_id, theme, study_goal_minutes, notification_enabled, study_reminders, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`settings-${userId}`, userId, 'system', 60, 1, 1, now, now),
    ]);

    const cookie = await createSessionCookie(userId);
    return NextResponse.json(
      { userId, username, email },
      { status: 201, headers: { 'Set-Cookie': cookie } }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
