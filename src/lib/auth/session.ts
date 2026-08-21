import { signSession, verifySession, type SessionPayload } from './jwt';

const SESSION_COOKIE = 'studyforge-session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function createSessionCookie(userId: string): Promise<string> {
  const token = await signSession(userId);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Secure`;
}

export function destroySessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure;`;
}

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get('Cookie') || '';
  // Parse cookies properly - handle multiple cookies
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((c) => {
    const eqIdx = c.indexOf('=');
    if (eqIdx === -1) return;
    const key = c.substring(0, eqIdx).trim();
    const val = c.substring(eqIdx + 1).trim();
    cookies[key] = val;
  });

  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  return verifySession(token);
}

export { SESSION_COOKIE };