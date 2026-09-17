# INFAIX Study

Local-first student productivity platform. Organise subjects, track study time,
set weekly goals, and know exactly what to study next — running entirely on a
per-user D1 database with anonymous local-first study for signed-out users.

Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4, deployed
as a Cloudflare Worker via OpenNext. Database: Cloudflare D1.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000. The canonical Study Hub lives at `/`; `/study`,
`/hub` redirect there; `/history`, `/subjects` and `/settings` are the other
primary destinations.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm test` | Run the Vitest suite (pure logic + client helpers) |
| `npm run lint` | ESLint across the repo |
| `npx tsc --noEmit` | Typecheck |
| `npm run build` | OpenNext Cloudflare build (`opennextjs-cloudflare build`) |
| `npm run deploy` | Build + deploy the Worker to Cloudflare |

## Configuration

- `wrangler.jsonc` — Worker name, D1 bindings: `DATABASE` (app data) and
  `NEXT_TAG_CACHE_D1` (tag cache). **Do not rename databases or change IDs.**
- `open-next.config.ts` — OpenNext/Cloudflare adapter configuration.
- `migrations/` — D1 schema in apply order (0001 → 0004). Additive only.
- `JWT_SECRET` — production: `npx wrangler secret put JWT_SECRET`; local:
  `.dev.vars` (see `.dev.vars.example`). Production fails closed without it.
- `GET /api/health` — public liveness + D1 probe (200/503, minimal payload).

## Branding

Public product name is **INFAIX Study** (`https://study.infaix.com`). The
canonical constants live in `src/lib/brand.ts`.

Migration-sensitive identifiers keep their historical `studyforge-*` values on
purpose: the session cookie, localStorage keys, `[studyforge]` devLog prefix and
the `__studyforgeFlushAll` gate. Do not rename them — anonymous local data and
existing sessions depend on them. See `docs/technical.md`.

## Verification on Windows

PowerShell blocks `.bin` scripts, so run tools through `cmd`:

```powershell
cmd /c "node_modules\.bin\vitest run 2>&1"
cmd /c "node_modules\.bin\tsc.cmd --noEmit 2>&1"
cmd /c "node_modules\.bin\eslint <paths> 2>&1"
cmd /c "npm run build 2>&1"
node scripts/verify-d1-migrations.mjs
```

Note: this machine is Windows ARM64. `workerd` has no `windows-arm64` binary,
so after a fresh `npm ci` re-add the x64 workerd (it runs under the OS's
emulation) before building:

```powershell
cmd /c "npm.cmd install --force --no-save @cloudflare/workerd-windows-64@1.20260811.1"
```

See `docs/technical.md` and `docs/deployment.md` for details.