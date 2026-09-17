import { SESSION_COOKIE } from './session';
import { verifySession, type SessionPayload } from './jwt';

/**
 * Identity returned by an auth provider. Long-term, an INFAIX auth service is
 * expected to issue this shape; StudyForge business logic only relies on
 * `userId` (everything StudyForge-specific — subjects, goals, sessions, stats —
 * stays keyed to a StudyForge profile derived from that identity).
 */
export interface StudyIdentity {
  userId: string;
  /** Populated by the provider when available (never trusted from clients). */
  email?: string;
  displayName?: string;
  roles?: string[];
  session?: Record<string, unknown>;
}
export type AuthIdentity = StudyIdentity;

/**
 * Authentication boundary for StudyForge business logic.
 *
 * Everything that needs "who is making this request" depends on
 * `getCurrentUser(request)` — NOT on StudyForge cookie/JWT internals. Swapping
 * `studyForgeAuthProvider` for an INFAIX-backed provider later (validating an
 * INFAIX-issued signed session/assertion server-side) must not require touching
 * study goals, timers, stats or history.
 */
export interface StudyAuthProvider {
  getIdentity(request: Request): Promise<StudyIdentity | null>;
}
export type AuthProvider = StudyAuthProvider;

export interface CookieAuthProviderOptions {
  cookieName?: string;
  /** Token → payload. Injectable for tests (defaults to the JWT verifier). */
  verify?: (token: string) => Promise<SessionPayload | null>;
  /** Optional enrichment of the identity after verification (e.g. email/name). */
  augment?: (userId: string) => Partial<AuthIdentity> | Promise<Partial<AuthIdentity>> | null | void;
}

/**
 * The current (StudyForge-native) provider: server-side JWT cookie auth,
 * HttpOnly `studyforge-session` cookie, verified on every request. User IDs are
 * resolved from the session, never accepted from the client.
 */
export function createCookieAuthProvider(options: CookieAuthProviderOptions = {}): StudyAuthProvider {
  const cookieName = options.cookieName ?? SESSION_COOKIE;
  const verify = options.verify ?? verifySession;
  const augment = options.augment;

  return {
    async getIdentity(request: Request): Promise<StudyIdentity | null> {
      const cookieHeader = request.headers.get('Cookie') || '';
      const cookies: Record<string, string> = {};
      cookieHeader.split(';').forEach((c) => {
        const eqIdx = c.indexOf('=');
        if (eqIdx === -1) return;
        const key = c.substring(0, eqIdx).trim();
        const val = c.substring(eqIdx + 1).trim();
        cookies[key] = val;
      });

      const token = cookies[cookieName];
      if (!token) return null;

      const payload = await verify(token);
      if (!payload || !payload.userId) return null;

      const identity: AuthIdentity = { userId: payload.userId };
      if (augment) {
        const extra = await augment(identity.userId);
        if (extra) Object.assign(identity, extra);
      }
      return identity;
    },
  };
}

/**
 * The active provider. When real INFAIX SSO is introduced with a secure
 * session exchange, replace this binding (and its construction) with an
 * INFAIX-backed provider that returns the same `AuthIdentity` shape.
 */
export const legacyStudyAuthProvider: StudyAuthProvider = createCookieAuthProvider();
export const studyForgeAuthProvider = legacyStudyAuthProvider;

/** Single entry point for "who is the current user?" in server code. */
export async function getCurrentUser(request: Request): Promise<AuthIdentity | null> {
  return studyForgeAuthProvider.getIdentity(request);
}

/**
 * Study-domain alias for `getCurrentUser`. INFAIX Study server code should
 * resolve "who is studying right now?" through this name so the eventual swap
 * to a real INFAIX Account provider stays invisible to the study features
 * (goals, timers, stats, history).
 */
export async function getCurrentStudyIdentity(request: Request): Promise<AuthIdentity | null> {
  return studyForgeAuthProvider.getIdentity(request);
}

/** Contract for the future INFAIX Account adapter. Its verification details
 * are intentionally supplied by the identity service, never guessed here. */
export interface InfaixAccountAuthProvider extends StudyAuthProvider {
  readonly providerName: 'infaix-account';
}
