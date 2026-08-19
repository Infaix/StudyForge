import { NextResponse } from 'next/server';
import { destroySessionCookie } from '@/lib/auth/session';

export async function POST() {
  const cookie = destroySessionCookie();
  return NextResponse.json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
}
