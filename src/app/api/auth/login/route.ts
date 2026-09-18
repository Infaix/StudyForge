import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('login' in body) || !('password' in body)
    || typeof body.login !== 'string' || typeof body.password !== 'string'
    || !body.login.trim() || !body.password) {
    return NextResponse.json({ error: 'Login and password are required' }, { status: 400 });
  }
  const login = body.login.trim();
  const password = body.password;
  try {
    const { env } = getCloudflareContext();
    const db = env.DATABASE;

    type LoginUser = { id: string; password_hash: string };
    let user = await db.prepare('SELECT id, password_hash FROM users WHERE email = ? OR username = ?').bind(login, login).first<LoginUser>();
    if (!user) {
      // Preserve legacy exact identities. Accept different casing only when
      // it resolves to one account; never choose arbitrarily between users.
      const { results } = await db.prepare(
        'SELECT id, password_hash FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE LIMIT 2'
      ).bind(login, login).all<LoginUser>();
      if (results.length === 1) user = results[0];
    }

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
  } catch {
    // Database errors can contain bound values; never log credentials.
    console.error('Login failed while resolving credentials or creating the session');
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
