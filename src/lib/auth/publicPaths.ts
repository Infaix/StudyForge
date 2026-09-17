/**
 * Paths reachable without an authenticated INFAIX Study session.
 *
 * `/` and `/study/lock-in` are anonymous-capable study pages; `/login` and `/register` are the
 * credential pages; `/api/auth/*` are the auth endpoints (each route still
 * enforces its own session check where one is required). `/api/health` is
 * intentionally public so external probes (Cloudflare health checks, the
 * deployment smoke test) can verify liveness without credentials.
 *
 * Everything else passes through the middleware session check: API routes
 * answer 401, pages redirect to `/login`.
 */
export const PUBLIC_PATHS = [
  '/',
  '/study/lock-in',
  '/login',
  '/register',
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/me',
  '/api/auth/logout',
] as const;
