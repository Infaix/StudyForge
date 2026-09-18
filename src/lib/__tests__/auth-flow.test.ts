import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashPassword } from '../auth/password';
import { createSessionCookie, getSessionFromRequest } from '../auth/session';
import { getCurrentStudyIdentity } from '../auth/provider';
import { middleware } from '../../middleware';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { SignJWT } from 'jose';
import { resolveSigningSecret, verifySession } from '../auth/jwt';

const { first, bind, all } = vi.hoisted(() => ({ first: vi.fn(), bind: vi.fn(), all: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DATABASE: { prepare: () => ({ bind }) } } }) }));
const request = (body: unknown) => new NextRequest('https://study.example/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
beforeEach(() => { bind.mockReturnValue({ first, all }); all.mockResolvedValue({ results: [] }); });
afterEach(() => { vi.clearAllMocks(); });

describe('legacy authentication', () => {
  it('verifies a password, establishes a secure cookie, resolves identity and opens protected routes', async () => {
    first.mockResolvedValue({ id: 'u1', password_hash: await hashPassword('test-only-password') });
    const response = await login(request({ login: 'user', password: 'test-only-password' }));
    expect(response.status).toBe(200);
    const raw = response.headers.get('set-cookie')!;
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) expect(raw).toContain(attribute);
    const headers = { cookie: raw.split(';')[0] };
    const protectedRequest = new NextRequest('https://study.example/subjects', { headers });
    expect((await getSessionFromRequest(protectedRequest))?.userId).toBe('u1');
    expect((await getCurrentStudyIdentity(protectedRequest))?.userId).toBe('u1');
    expect((await middleware(protectedRequest)).status).toBe(200);
  });
  it('rejects incorrect passwords', async () => {
    first.mockResolvedValue({ id: 'u1', password_hash: await hashPassword('test-only-password') });
    expect((await login(request({ login: 'user', password: 'incorrect' }))).status).toBe(401);
  });
  it('rejects unknown accounts', async () => {
    first.mockResolvedValue(null);
    expect((await login(request({ login: 'missing', password: 'incorrect' }))).status).toBe(401);
  });
  it('accepts a unique case-insensitive legacy identity', async () => {
    first.mockResolvedValue(null);
    all.mockResolvedValue({ results: [{ id: 'u1', password_hash: await hashPassword('test-only-password') }] });
    expect((await login(request({ login: 'infaix', password: 'test-only-password' }))).status).toBe(200);
  });
  it('rejects ambiguous case-insensitive identities instead of selecting a user', async () => {
    first.mockResolvedValue(null);
    all.mockResolvedValue({ results: [{ id: 'u1' }, { id: 'u2' }] });
    expect((await login(request({ login: 'mixed-case', password: 'test-only-password' }))).status).toBe(401);
  });
  it.each([null, [], {}, { login: {}, password: [] }, { login: ' ', password: 'x' }])('rejects malformed input: %j', async body => {
    expect((await login(request(body))).status).toBe(400);
    expect(bind).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON', async () => {
    expect((await login(new NextRequest('https://study.example/api/auth/login', { method: 'POST', body: '{' }))).status).toBe(400);
  });
  it('clears the cookie at logout and protects anonymous pages and APIs', async () => {
    const response = await logout();
    expect(response.headers.get('set-cookie')).toContain('studyforge-session=;');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await middleware(new NextRequest('https://study.example/subjects'))).status).toBe(307);
    expect((await middleware(new NextRequest('https://study.example/api/study/stats'))).status).toBe(401);
  });
  it('rejects tampered sessions', async () => {
    const cookie = (await createSessionCookie('u1')).split(';')[0] + 'tampered';
    const req = new NextRequest('https://study.example/subjects', { headers: { cookie } });
    expect(await getCurrentStudyIdentity(req)).toBeNull();
    expect((await middleware(req)).status).toBe(307);
  });
  it('rejects expired or structurally invalid signed sessions', async () => {
    const key = resolveSigningSecret({ NODE_ENV: 'test' });
    for (const payload of [{ userId: 'u1', exp: 1 }, { userId: 123, exp: 9999999999 }, { userId: 'u1' }]) {
      const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(key);
      expect(await verifySession(token)).toBeNull();
    }
  });
});
