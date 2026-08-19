import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { login, password } = await request.json();

    if (!login || !password) {
      return NextResponse.json({ error: 'Login and password are required' }, { status: 400 });
    }

    const { env } = getCloudflareContext();
    const db = env.DATABASE;

    const user = await db.prepare('SELECT id, password_hash FROM users WHERE email = ? OR username = ?').bind(login, login).first<{ id: string; password_hash: string }>();

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const cookie = await createSessionCookie(user.id);
    return NextResponse.json(
      { userId: user.id },
      { headers: { 'Set-Cookie': cookie } }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
