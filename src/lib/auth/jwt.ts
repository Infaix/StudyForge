import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * JWT_SECRET management for INFAIX Study.
 *
 * Production fails CLOSED but LAZILY: the secret is resolved on first signing
 * or verification use, never at module load. Cloudflare secrets are injected
 * at runtime (`wrangler secret put JWT_SECRET`) and are NOT present during a
 * local `next build` — resolving at import time would therefore break every
 * build. At runtime a production deployment without JWT_SECRET throws the
 * moment a session is signed or verified, so it can never silently fall back
 * to the development key.
 *
 * Next.js statically replaces `process.env.NODE_ENV` with its build-time
 * literal, so in the deployed worker bundle this code always sees
 * 'production' at runtime and 'development'/'test' under `next dev`/vitest.
 */
export interface JwtEnv {
  JWT_SECRET?: string;
  NODE_ENV?: string;
}

const DEV_FALLBACK_SECRET = 'studyforge-dev-secret-change-in-production';

export function resolveSigningSecret(env: JwtEnv): Uint8Array {
  const secret = env.JWT_SECRET?.trim();
  if (secret) return new TextEncoder().encode(secret);
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. Set it with: npx wrangler secret put JWT_SECRET'
    );
  }
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

let cachedSecret: Uint8Array | null = null;

function signingSecret(): Uint8Array {
  cachedSecret ??= resolveSigningSecret({
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  });
  return cachedSecret;
}

export interface SessionPayload extends JWTPayload {
  userId: string;
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ userId } satisfies SessionPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(signingSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingSecret());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}