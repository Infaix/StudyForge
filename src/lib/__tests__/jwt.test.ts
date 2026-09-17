import { afterEach, describe, it, expect, vi } from 'vitest';
import { resolveSigningSecret, signSession, verifySession } from '../auth/jwt';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const decode = (u8: Uint8Array) => new TextDecoder().decode(u8);

describe('resolveSigningSecret', () => {
  it('returns the provided secret when set', () => {
    const bytes = resolveSigningSecret({ JWT_SECRET: 'super-secret', NODE_ENV: 'production' });
    expect(decode(bytes)).toBe('super-secret');
  });

  it('prefers an explicit development secret over the fallback', () => {
    expect(decode(resolveSigningSecret({ JWT_SECRET: 'dev-local', NODE_ENV: 'development' }))).toBe('dev-local');
  });

  it('throws in production when JWT_SECRET is missing (fails closed)', () => {
    expect(() => resolveSigningSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('throws in production for a blank/whitespace secret', () => {
    expect(() => resolveSigningSecret({ JWT_SECRET: '   ', NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('falls back to the development key outside production', () => {
    expect(decode(resolveSigningSecret({ NODE_ENV: 'development' }))).toBe('studyforge-dev-secret-change-in-production');
  });

  it('falls back when NODE_ENV is unset (tests/CI)', () => {
    expect(decode(resolveSigningSecret({}))).toBe('studyforge-dev-secret-change-in-production');
  });
});

describe('signSession / verifySession (test environment)', () => {
  it('round-trips a signed session and carries a 7d expiry', async () => {
    const token = await signSession('user-1');
    const payload = await verifySession(token);
    expect(payload?.userId).toBe('user-1');
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns null for an invalid or tampered token', async () => {
    const token = await signSession('user-1');
    expect(await verifySession(token + 'x')).toBeNull();
    expect(await verifySession('not-a-jwt')).toBeNull();
  });

  it('fails closed lazily: module loads without a secret, signing throws in production', async () => {
    // Simulates a production worker bundle (NODE_ENV statically replaced with
    // 'production') that has no JWT_SECRET configured at runtime.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    const jwt = await import('../auth/jwt');
    await expect(jwt.signSession('user-1')).rejects.toThrow(/JWT_SECRET is required in production/);
    expect(await jwt.verifySession('anything')).toBeNull();
  });
});