# INFAIX Study — Technical Notes

Rebrand + infrastructure audit for **INFAIX Study** (formerly StudyForge),
targeting `https://study.infaix.com`. This document is the reference for the
rebrand, the route model, the D1 schema, the auth boundary, the INFAIX Account
integration gap, and the deployment readiness checklist.

## Stack

- **Next.js 16.3.1** (App Router) + React 19 + TypeScript 5 + Tailwind v4.
- **OpenNext Cloudflare adapter** (`opennextjs-cloudflare`) — app runs on a
  Cloudflare Worker.
- **D1** — per-user persistence. Two bindings (see `wrangler.jsonc`):
  - `DATABASE` → `studyforge-db`
  - `NEXT_TAG_CACHE_D1` → `studyforge-tag-cache`
- Auth: JWT (jose, HS256) in an HttpOnly `studyforge-session` cookie (7 days),
  bcryptjs password hashing.

## Routes (canonical model)

| Path | Behaviour |
| --- | --- |
| `/` | **The Study Hub** — goals, active-timer CTA, stats, recent sessions. Anonymous-capable: shows local data + "sign in to sync" without forcing login. |
| `/study` | Redirects to `/` |
| `/hub` | Redirects to `/` (legacy) |
| `/history` | Grouped study history (server data for signed-in, local for anonymous) |
| `/subjects` | Subjects (local-first) |
| `/settings` | Theme + local data export/import/reset; rebranded to INFAIX Study |
| `/study/timer`, `/study/stopwatch` | Study clocks (anonymous-first, no forced login) |
| `/login`, `/register` | Legacy email/username auth; redirect to `/` after success |
| `/dashboard` | Existing analytics dashboard (kept; reachable via sidebar) |

All other existing routes (flashcards, notes, quizzes, planner, assessments,
calculators, formulas, social, friends, groups, leaderboard, profile) are
unchanged.

## Rebrand: public vs internal identifiers

**Public copy renamed to INFAIX Study:** root metadata (`layout.tsx`), the
brand lockup (🔥 + **INFAIX** / STUDY via `components/layout/BrandLogo.tsx`),
Sidebar/Header logos, login/register headings, settings About/export naming,
assessments/dashboard/timer/stopwatch copy, `public/robots.txt` (sitemap now
`https://study.infaix.com/sitemap.xml`), README. Constants live in
`src/lib/brand.ts` (`BRAND_NAME`, `PRODUCT_NAME`, `APP_NAME`, `APP_ORIGIN`,
`EXPORT_FILE_PREFIX`).

**Internal identifiers preserved (migration-sensitive — do NOT rename):**

| Identifier | Where | Why it must stay |
| --- | --- | --- |
| `studyforge-session` | `middleware.ts`, `lib/auth/session.ts` | Validation cookie for all existing sessions |
| `studyforge-pending-segments`, `studyforge-device-id`, `studyforge-anon-segments`, `studyforge-active-timer`, `studyforge-timer-lock` | `lib/client/studySubmission.ts` | Anonymous/local study time survives the rebrand |
| `studyforge-anon-goals` | `lib/client/goalStore.ts` | Anonymous weekly goals |
| `studyforge-levelup` | `lib/client/useStudyTimeSync.ts` | Custom browser event |
| `[studyforge]` devLog prefix | `lib/client/devLog.ts` | Log format |
| `__studyforgeFlushAll` | `AuthContext.tsx` / `useStudyTimeSync.ts` | Sign-out flush gate |
| Worker name `studyforge` + D1 names/IDs | `wrangler.jsonc` | Existing deployed resources |
| JWT dev fallback secret | `lib/auth/jwt.ts` | Changing it invalidates sessions signed with it |

## D1 schema

Migrations apply in order `migrations/0001_init.sql` → `0004_study_goals.sql`.
Audited against every server query (`src/lib/server/**`, `src/app/api/**`,
`src/lib/db/index.ts` ENTITIES map):

- A fresh DB applying 0001→0004 satisfies every reachable code path.
- All relied-on indexes exist (segment idempotency, stats/history access,
  XP idempotency, goals partial-unique, user_settings, friends/notifications).
- **No migration 0005 is required.**
- One latent drift was fixed in code (not schema): `xp.ts:337` wrote
  `unlocked_at` as `unlockedAt` (dead code, would have failed on insert).
- `study_goals`: weekly-only (`period IN ('weekly')`), `subject_id NULL` =
  overall goal, partial-unique indexes forbid duplicates, `target_seconds > 0`.

Additive changes only: never rewrite or drop applied migrations.

## DB health check

`src/lib/server/dbHealth.ts` provides a safe, read-only health check
(`SELECT 1` + `sqlite_master` lookups) with zero data access and no secrets:

- `checkD1Health(db)` — pure, unit-tested.
- `getDbHealth()` — resolves the `DATABASE` binding and reports
  `binding: 'missing'` if the binding is not configured.
- `summarizeHealth(result)` — collapses a result into the minimal public
  payload `{ status: 'ok' | 'degraded', database: 'ok' | 'unavailable' }`.

`GET /api/health` (`src/app/api/health/route.ts`) is wired and **public** (in
`PUBLIC_PATHS`, `src/lib/auth/publicPaths.ts`): 200 when D1 answers and the
core tables exist, 503 otherwise. It never returns binding names, table
lists, SQL, errors or IDs.

## Sitemap & robots

`src/app/sitemap.ts` emits exactly one URL — `https://study.infaix.com/` — since
every other route requires authentication or has no SEO value.
`public/robots.txt` already points at `/sitemap.xml`.

## Env configuration

Only `JWT_SECRET` (and tool-chain `NODE_ENV`) are read by app code. Reference
files: `.env.example` (gitignored real env are `.env*`), `.dev.vars.example`
for local Wrangler/OpenNext secrets (`.dev.vars` is gitignored).

`src/lib/auth/jwt.ts` resolves the signing secret **lazily and fail-closed**:
- A provided `JWT_SECRET` is always used.
- In production (`NODE_ENV === 'production'`) a missing/blank `JWT_SECRET`
  throws at first signing use — never a silent dev fallback. `verifySession`
  degrades to `null` instead.
- The dev fallback key is only reachable outside production (`next dev`,
  vitest). Resolution is lazy so a Cloudflare build (where secrets exist only
  at runtime) is not blocked.

## Auth boundary and the INFAIX Account integration gap

`src/lib/auth/provider.ts` already defines the boundary:

- `AuthIdentity` (shape: `userId`, `email?`, `displayName?`, ...) — what
  INFAIX Account is expected to issue.
- `AuthProvider.getCurrentUser(request)` + `studyForgeAuthProvider` (current
  JWT-cookie provider).
- `getCurrentUser(request)` / `getCurrentStudyIdentity(request)` — single
  entry point for all server code.

**Status: prepared only.** No INFAIX Account identity service exists in this
workspace, so real SSO cannot be implemented here. Replacing
`studyForgeAuthProvider` with an INFAIX-backed provider (server-side validation
of an INFAIX-issued session/assertion) later must require no changes to goals,
timers, stats, or history. Do not fake a "Continue with INFAIX" button until a
real provider exists.

## Anonymous-first compatibility

- Signed-out users can study with timers/stopwatches immediately; segments are
  persisted to localStorage and never dropped on failure.
- On sign-in, `AuthContext.migrateGoalsAfterAuth` +
  `migrateAnonymousSegments` push local data to the account (idempotent, stable
  IDs, no loss).
- The `/` hub now renders anonymous mode: local total/today stats, grouped
  local history, and a "sign in to sync" prompt.

## Domain readiness (deployment)

See `docs/deployment.md` for the full operator runbook. Readiness state:

1. `<brand>/rebrand` completed; `robots.txt` + `sitemap.ts` emit the canonical
   `https://study.infaix.com` URLs.
2. `wrangler.jsonc` bindings reference the existing `studyforge-db` /
   `studyforge-tag-cache` resources (IDs present, unchanged).
3. `JWT_SECRET` fail-closed in production; set via `wrangler secret put`.
4. `/api/health` wired + public (200/503), safe payload.
5. Production `npm run build` **verified** on this machine (see workerd note
   below); Linux/WSL remains the preferred build platform.
6. `study.infaix.com` → `studyforge` Worker (custom domain or zone route) is
   an operator step — needs the INFAIX Cloudflare account.

## Known platform limitation

Node 24 on this machine is `win32 arm64`. `workerd` ships no `windows-arm64`
binary, so npm skips `@cloudflare/workerd-windows-64` and Wrangler/OpenNext
cannot find a binary after a plain install. Verified fix on this machine: the
Windows x64 workerd runs under the OS's x64 emulation when installed
explicitly:

```powershell
cmd /c "npm.cmd install --force --no-save @cloudflare/workerd-windows-64@1.20260811.1"
```

With that in place `npm run build` (`opennextjs-cloudflare build`) completes
successfully here (46 static routes incl. `/`, `/sitemap.xml`; `/api/health`
dynamic) and `wrangler d1 migrations apply --local` works. Run this command
again after any `npm ci`. OpenNext still warns Windows is not fully supported —
release builds should use Linux/WSL. Offline migration verification does not
need workerd at all: `node scripts/verify-d1-migrations.mjs` (uses `node:sqlite`).