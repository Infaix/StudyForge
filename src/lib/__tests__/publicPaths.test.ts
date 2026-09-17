import { describe, it, expect } from 'vitest';
import { PUBLIC_PATHS } from '../auth/publicPaths';

describe('public route contract', () => {
  it('exposes the anonymous Study Hub, auth pages and auth API', () => {
    expect(PUBLIC_PATHS).toEqual(
      expect.arrayContaining([
        '/',
        '/study/lock-in',
        '/login',
        '/register',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/me',
        '/api/auth/logout',
      ])
    );
  });

  it('keeps the health probe reachable without credentials', () => {
    expect(PUBLIC_PATHS).toContain('/api/health');
  });

  it('does not whitelist user-data or protected API routes', () => {
    for (const path of [
      '/api/goals',
      '/api/study/stats',
      '/api/study/history',
      '/api/study/sessions/complete',
      '/api/data/subjects',
      '/api/social/friends',
      '/api/health/secret-administration-endpoint',
      '/dashboard',
      '/settings',
      '/history',
    ]) {
      expect(PUBLIC_PATHS).not.toContain(path);
    }
  });
});
