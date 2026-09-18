# Authentication checkpoint — 17 September 2026

Phase A is incomplete. Phase B has not started because the required successful existing-account login, navigation, refresh, and logout sequence has not passed. Nothing was deployed, committed, or pushed; production D1 was queried read-only.

## SIGN-IN ROOT CAUSE

Confirmed findings, with separate failure stages:

1. **Identity lookup is case-sensitive.** The supplied `infaix` login does not match the production username `Infaix`. The deployed endpoint returned 401 without establishing a cookie. A read-only D1 query confirmed zero exact matches and one case-insensitive match.
2. **Exact casing still fails credential validation.** A second request using `Infaix` and the supplied password also returned 401. That account exists in the bound production database. The supplied credentials therefore have not passed the deployed credential check; no password was reset or hash retrieved.
3. **The client hides failed authentication.** `AuthProvider` previously replaced its children whenever `isLoading` became true. Submitting login unmounted the form, discarding its local state; the returning error was applied to an unmounted component. Reproduced in the generated worker browser: invalid login returned to an empty form without an error. After the fix, the same flow retains the form and visibly shows `Invalid credentials`.
4. **Runtime secret configuration is incomplete.** The Cloudflare dashboard shows `JWT_SECRET` under Builds → Variables and secrets, but no entries under Runtime variables and secrets. Build secrets do not establish a Worker runtime secret. The production fail-closed signing behavior is covered by tests; actual production signing was not reached with the supplied credentials.
5. **Production schema is behind the application.** `/api/health` returned 503 with `{"status":"degraded","database":"unavailable"}`. Direct read-only queries confirmed that `study_goals` is missing and none of `duration_seconds`, `segment_id`, `session_id`, or `device_id` exist in `study_sessions`. D1 itself responds; the health message also covers missing tables. These missing schema elements block the complete Study API flow even after credentials are corrected.

### Database audit

Cloudflare dashboard: Worker `studyforge`, custom domain `study.infaix.com`, binding `DATABASE` → `studyforge-db`, database ID `d3a604ef-2ba8-401b-862f-b13b98b62290`. These match `wrangler.jsonc`. Local preview uses a separate local simulation of that binding, not production records.

| Check | Local D1 | Production D1 |
| --- | ---: | ---: |
| Users | 14 | 3 |
| Populated password hashes | 14 | 3 |
| Profiles | 14 | 3 |
| Users missing profiles | 0 | 0 |
| Missing expected auth field values | 0 | 0 |
| Duplicate emails | 0 | 0 |
| Duplicate usernames | 0 | 0 |
| Orphaned study sessions | 0 | 0 |
| Orphaned subjects | 0 | 0 |
| Orphaned study goals | 0 | Not applicable: table missing |

Production duplicate checks used lowercase identities. Local checks used exact identities and also found no email/username cross-account collision. No password hashes, passwords, JWTs, session cookie contents, or secret values were printed.

## AUTH FIX

- `src/contexts/AuthContext.tsx`: distinguish initial authentication loading from mutations, preserve mounted forms, require a successful uncached `/api/auth/me` check before reporting successful sign-in/sign-up, and check logout response success before clearing client identity.
- `src/app/api/auth/login/route.ts`: validate JSON and field types before D1 access; malformed requests return 400; trim login; retain exact legacy identity lookup and add case-insensitive fallback only when it resolves to one account; remove raw exception logging that could include bound values.
- `src/lib/auth/jwt.ts`: restrict verification to HS256 and require a nonempty string identity plus expiry.
- `eslint.config.mjs`: exclude generated `.open-next` and `.wrangler` artifacts from source linting.
- `package.json` / lockfile: add React Testing Library and jsdom for real mounted-form regression coverage.

Existing Study JWT authentication, D1 ownership, and `studyforge-session` remain in place. Timer calculations, sync, XP, history grouping, and goal persistence were not changed.

### Cookies and secrets

The session cookie policy remains `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`. Logout expires the same cookie at `/`. Automated tests verify these attributes. No insecure HTTP exception or production fallback was introduced. Local browser persistence cannot be claimed without a valid existing local account login; use local HTTPS if the selected browser rejects Secure cookies on loopback HTTP.

The local preview reports a populated runtime JWT_SECRET binding without displaying its value. Tests prove production signing throws without a secret and verification fails closed. The production dashboard evidence described above identifies the missing runtime configuration; a successful production signing request remains unverified.

## AUTH END-TO-END VERIFICATION

Generated OpenNext worker was run through Wrangler with local D1. Browser verification reproduced and then verified the repaired error display. HTTP checks passed: local health 200, anonymous `/api/auth/me` 401, `/subjects` redirect to login, invalid-cookie Study API 401, malformed login 400 after repair, and logout 200 with cookie expiry.

The supplied account is not in local D1. Hosted login failed for both supplied and stored casing. Therefore successful cookie persistence, authenticated `/api/auth/me`, subjects/history/exams/settings navigation, refresh, and authenticated logout are **not proven**. Endpoint/unit success is not being presented as end-to-end success.

## AUTH REGRESSION TESTS

`src/contexts/__tests__/AuthContext.test.tsx` covers mounted-form preservation, visible credential rejection, successful identity resolution, and rejecting a 200 login response followed by a failed identity check.

`src/lib/__tests__/auth-flow.test.ts` covers valid password login, secure session creation, provider identity, protected routes, wrong password, unknown account, malformed JSON and fields, logout expiry, anonymous API rejection, tampered/expired/invalid-payload JWTs, unique case-insensitive identities, and ambiguous identities. Existing JWT tests retain production fail-closed checks.

## UI DESIGN DIRECTION

Deferred at the user's explicit Phase A checkpoint. No visual rebuild has started.

## HUB

Deferred.

## LOGIN UI

Functional error handling repaired and verified; visual redesign deferred.

## TIMER

Deferred; canonical calculations unchanged.

## LOCK-IN

Deferred; no behavior changes.

## SUBJECTS

Deferred; persistence unchanged.

## EXAMS

Deferred.

## HISTORY

Deferred; grouping unchanged.

## SETTINGS

Deferred.

## MOTION

Deferred.

## MOBILE

Responsive redesign and breakpoint verification deferred.

## ACCESSIBILITY

Visual/accessibility rebuild deferred. Authentication errors now remain visible, but a full accessibility audit has not been completed.

## PERFORMANCE

No animation or polling added. The identity request explicitly bypasses the browser cache. Exact credential lookup remains the first query; the second query is used only when the exact identity is absent.

## TEST COUNT

181 tests across 20 files, including 17 new authentication regressions (baseline: 164).

## TYPESCRIPT

`npx tsc --noEmit` passed after the auth changes.

## ESLINT

`npm run lint` was run. Repository-wide result: 69 errors and 68 warnings. Errors are in unchanged source files: 39 `react-hooks/static-components`, 22 `react-hooks/rules-of-hooks`, seven `react/no-unescaped-entities`, and one `prefer-const`. The authentication changes introduce no lint errors. Generated worker output initially caused lint to traverse build artifacts; the ignore configuration now excludes those artifacts.

## MIGRATIONS

`node scripts/verify-d1-migrations.mjs` passed all five migrations against a fresh temporary database. No production migrations were applied. Production schema inspection confirms missing fields/tables from migrations 0002–0004; partial migration state must be checked before applying ALTER statements.

## BUILD

OpenNext worker generation succeeds on this Windows environment with its existing platform warning and Next.js middleware deprecation warning. A preview process must be stopped before rebuilding on Windows because it holds generated files open.

## REMAINING ISSUES

1. Obtain valid credentials for an existing account. The supplied password did not authenticate against the stored-case production username. No account changes are authorized by the brief.
2. Configure JWT_SECRET as a **Worker runtime secret**, not merely a build secret. This changes production configuration and was not performed.
3. Review and apply the missing production schema migrations after checking each existing column/index. Migration 0002 adds Study/XP fields, 0003 adds session/device grouping fields and backfills session IDs, and 0004 adds goals. This would modify production D1, explicitly prohibited by the current brief, so it was not performed.
4. An existing development account with known credentials, or an approved development database copy, is needed to prove the repaired local worker login. Creating/replacing users to make the test pass was not done.
5. Resolve the repository's existing lint errors before declaring the Phase A gate fully passed.
6. Complete the full authenticated browser navigation/refresh/logout sequence before starting Phase B.
7. Wrangler touched two bytes on the tracked local SQLite `_cf_METADATA` page during preview/audit. No user-table pages changed. This runtime metadata change is left in place rather than replacing the user's database file.

Cloudflare CLI has no usable account credentials in this shell; production inspection was completed through the user's existing signed-in dashboard session. No runtime secret values were revealed.
