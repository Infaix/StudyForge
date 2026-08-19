import { signSession, verifySession, type SessionPayload } from './jwt';

const SESSION_COOKIE = 'studyforge-session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function createSessionCookie(userId: string): Promise<string> {
  const token = await signSession(userId);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Secure`;
}

export function destroySessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );

  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  return verifySession(token);
}

export { SESSION_COOKIE };
