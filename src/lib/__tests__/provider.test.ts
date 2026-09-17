import { describe, expect, it } from 'vitest';
import { createCookieAuthProvider } from '../auth/provider';

describe('Study auth provider boundary', () => {
  it('returns only identity from a verified legacy session', async () => {
    const provider = createCookieAuthProvider({
      cookieName: 'legacy-session',
      verify: async (token) => token === 'valid' ? { userId: 'study-user-1' } : null,
    });
    expect(await provider.getIdentity(new Request('https://study.infaix.com', { headers: { Cookie: 'legacy-session=valid' } }))).toEqual({ userId: 'study-user-1' });
  });

  it('fails closed when the cookie or verification is invalid', async () => {
    const provider = createCookieAuthProvider({ verify: async () => null });
    expect(await provider.getIdentity(new Request('https://study.infaix.com'))).toBeNull();
    expect(await provider.getIdentity(new Request('https://study.infaix.com', { headers: { Cookie: 'studyforge-session=forged' } }))).toBeNull();
  });
});
