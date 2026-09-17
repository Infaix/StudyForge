# INFAIX Study — Deployment Guide

Targets **Cloudflare Workers + D1** via OpenNext. The canonical environment is
`study.infaix.com` on the `studyforge` worker. Production D1 (`studyforge-db`)
and tag cache (`studyforge-tag-cache`) already exist — **never run destructive
or remote operations against them without explicit sign-off.**

## 1. Verify first (pre-deploy gate)

```bash
npm test                       # Vitest suite
npx tsc --noEmit               # typecheck
npx eslint src                 # lint
node scripts/verify-d1-migrations.mjs   # offline: fresh DB applies 0001→0004 cleanly
```

`verify-d1-migrations.mjs` uses `node:sqlite` (Node ≥ 22.5), so it runs on any
OS/CI without a workerd binary.

## 2. Secrets

- **Production:** `npx wrangler secret put JWT_SECRET` (paste a long random
  value). Production **fails closed**: without it, signing a session throws
  (`src/lib/auth/jwt.ts`) — there is no silent dev fallback in production.
- **Local dev:** `.dev.vars` (copy from `.dev.vars.example`). Dev-only values;
  never used in production. `.dev.vars` is gitignored.
- Only `JWT_SECRET` is read by app code. `next build` type-checks in CI, so no
  `JWT_SECRET` is needed to build.

## 3. Database

Migrations are additive and ordered (`migrations/0001..0004`). Apply a NEW
migration to production only after the pre-deploy gate passes:

```bash
npx wrangler d1 migrations apply studyforge-db --remote   # explicitly reviewed
```

Local (no production impact):

```bash
npx wrangler d1 migrations apply studyforge-db --local
```

Ownership check (an operator task — needs your Cloudflare account):

```bash
npx wrangler d1 info studyforge-db                      # shows id/version/bindings
npx wrangler d1 list                                     # confirm DB inventory
```

`wrangler.jsonc` (verified): worker `studyforge`, `DATABASE` →
`studyforge-db` (`d3a604ef-2ba8-401b-862f-b13b98b62290`),
`NEXT_TAG_CACHE_D1` → `studyforge-tag-cache`
(`9e144a9e-53f0-4f85-a390-9f38ded2fcda`),
compat `2026-08-18` + `nodejs_compat`, assets binding `ASSETS`,
`main: .open-next/worker.js`. `migrations_dir` is not set → Wrangler's default
`./migrations` matches the repo.

## 4. Build & deploy

```bash
npm run build     # opennextjs-cloudflare build → .open-next/worker.js + assets
npm run deploy    # build + opennextjs-cloudflare deploy (publishes to workers.dev)
```

Linux/macOS (and WSL) are the supported build platforms. See §7 for the
Windows ARM64 case.

## 5. Health endpoint

`GET /api/health` is public (in `PUBLIC_PATHS`):

- `200 {"status":"ok","database":"ok"}` — D1 answers and core tables exist.
- `503 {"status":"degraded","database":"unavailable"}` — anything else.

No identifiers, SQL, or stack traces are ever exposed. Wire it into Cloudflare
health checks and the smoke test (§6).

## 6. Smoke-test checklist (production)

1. `GET https://study.infaix.com/api/health` → `200 {"status":"ok","database":"ok"}`.
2. `GET https://study.infaix.com/sitemap.xml` → XML listing only `https://study.infaix.com/`.
3. `GET https://study.infaix.com/` anonymously → Study Hub renders, no forced login.
4. Register a throwaway account → redirected to `/`; refresh keeps you signed in
   (cookie `studyforge-session`).
5. Start a timer, stop it → segment syncs; `GET /api/study/stats` reflects it.
6. Sign out, sign back in → history/stats reload from D1; no duplicated segments.
7. Open the site with JavaScript disabled on a second tab after studying in a
   first — no lost progress (anonymouse/queued segments persist).
8. `GET https://study.infaix.com/subjects` while signed out → redirect to `/login`.

## 7. Windows ARM64 / workerd note

`workerd` has no `windows-arm64` binary. npm skips `@cloudflare/workerd-windows-64`
on `win32 arm64`, so Wrangler/OpenNext can't find a binary. On Windows ARM64 the
x64 workerd runs under the OS's x64 emulation — install it explicitly after each
`npm ci`:

```powershell
cmd /c "npm.cmd install --force --no-save @cloudflare/workerd-windows-64@1.20260811.1"
```

(`workerd@1.20260811.1` is pinned by the lockfile; check `node_modules/workerd`
version first.) This has been verified to build on this machine. OpenNext still
warns Windows is not fully supported — prefer Linux/WSL for release builds.

## 8. Domain readiness

`study.infaix.com` should be served by the deployed `studyforge` worker:

- **Custom Domain (Workers):** Dashboard → Workers → `studyforge` → Settings →
  Domains & Routes → Add Custom Domain `study.infaix.com` (Cloudflare provisions
  the DNS record automatically), **or**
- **Zone route:** add a route `study.infaix.com/*` to the `studyforge` worker.

Robots/sitemap are already domain-correct (`https://study.infaix.com/sitemap.xml`).
No deploy may proceed without an operator confirming `study.infaix.com` is
authoritatively delegated/owned by the INFAIX Cloudflare account.

## 9. Rollback & operations

- **App:** `opennextjs-cloudflare deploy` redeploys the previous build; Workers
  keep a version history (instant rollback).
- **Schema:** D1 migrations are additive-only. Rolling back = deploy app code
  that predates the new columns (old code ignores extra columns). Do NOT apply
  destructive SQL to production.
- **Cold start / compat:** `nodejs_compat` is required by OpenNext. Do not
  change the compatibility date or flags without retesting the build.

## 10. Security posture

- Cookie `studyforge-session`: `Path=/; HttpOnly; SameSite=Lax; Secure;
  Max-Age=604800`. **Secure is always set** — local dev over plain `http` will
  not persist the cookie; use HTTPS (or a tunnel) in dev.
- `JWT_SECRET` fail-closed in production (this guide's §2).
- `/api/health` exposes a fixed minimal payload only.
- No INFAIX Account SSO: the current auth is the self-contained JWT provider
  (`src/lib/auth/provider.ts`). Do not bolt on a fake "Continue with INFAIX"
  until a real provider exists. The boundary is already provider-agnostic.

## 11. Known upstream items

- Next 16 deprecates the `middleware` file convention in favour of `proxy` —
  builds work today with a deprecation warning; plan a codemod migration later.
- `npm audit` reports 8 advisories in the dependency tree (not introduced here);
  review before/after deploy as usual.