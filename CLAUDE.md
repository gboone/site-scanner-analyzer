# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Development (run both together)
npm run dev                          # starts server (port 3001) + client (port 5173) concurrently

# Run individually
npm run server                       # server only (tsx watch)
npm run client                       # client only (vite)

# Build for production
npm run build                        # builds shared → client → server in order

# Start production server
npm start                            # node server/dist/index.js

# Tests (server only, Node built-in test runner)
npm test                             # runs both test files
npx tsx --test server/src/utils/sanitize.test.ts      # single test file
npx tsx --test server/src/utils/publicFilter.test.ts  # single test file

# Database
npm run db:migrate                   # run Drizzle migrations
npm run db:studio                    # open Drizzle Studio (DB GUI)
npm run db:generate                  # generate migration from schema changes
```

## Architecture

**Monorepo (npm workspaces):** `server/` + `client/` + `shared/`

The `shared/` workspace exports TypeScript interfaces used by both server and client. Build order matters: shared must build before client and server.

**Server (Express, port 3001):** TypeScript compiled with `tsc`, run in dev via `tsx watch`. Startup sequence is intentional: health check endpoints are registered *before* async DB init (required for VIP container health probes). DB init retries up to 10× with 3s delays for ProxySQL readiness, then loads the `settings` table into the runtime config object and starts the scheduler.

**Client (React + Vite, port 5173):** Vite proxies `/api` → `http://localhost:3001` in dev. In production, Express serves `client/dist` as static files. State: TanStack React Query for server cache, Zustand for local UI state.

**Database:** MySQL 8.0 (MariaDB-compatible). Schema is auto-bootstrapped at startup via `initDb()` — no traditional migration workflow for new columns. `initDb()` adds columns and indexes idempotently, silently ignoring duplicate errors. The `drizzle-kit` commands are only used for inspecting and generating schema, not for the primary migration path.

## Key Files

| Path | Purpose |
|------|---------|
| `server/src/index.ts` | Server bootstrap: health probes → DB init → middleware → routes → scheduler |
| `server/src/db/index.ts` | Connection pool, `query()` / `execute()` / `transaction()` helpers, schema bootstrap, `refreshIsPublic()` |
| `server/src/db/schema.ts` | Drizzle type definitions for the 97-column `sites` table |
| `server/src/config.ts` | Loads `.env` from repo root + merges DB `settings` table; `.env` takes precedence |
| `server/src/routes/` | 13 route modules mounted at `/api/v1/` (see below) |
| `server/src/utils/sanitize.ts` | Prompt injection prevention (`sanitizeSingleLine`, `sanitizeMultiLine`, `encodeForPrompt`) |
| `server/src/utils/publicFilter.ts` | `PUBLIC_ONLY_CONDITION` SQL WHERE clause for excluding non-public sites |
| `server/src/utils/apiKeys.ts` | Per-user API key helpers: `generateApiKeyToken`, `hashToken`, `isAllowedOwnerEmail` |
| `server/src/routes/api-keys.ts` | Self-service per-user API key CRUD (`/api/v1/api-keys`) |
| `server/src/scheduler.ts` | node-cron jobs for GSA refresh + site rescan |
| `server/src/middleware/ssrf-protection.ts` | Blocks private IPs/localhost before any outbound fetch |
| `client/src/contexts/ScanQueueContext.tsx` | Global state for bulk scan progress |
| `client/src/scanner/` | Browser-side scanning modules (redirect chains, tech detection, DNS) |
| `server/src/scanner/` | Server-side equivalents (adapted from client: no CORS proxy, xmldom instead of DOMParser) |
| `shared/src/index.ts` | `SiteRecord`, briefing types, and other shared interfaces |

## API Routes

All routes mount under `/api/v1/`:

| Prefix | File | Notes |
|--------|------|-------|
| `/sites` | `routes/sites.ts` | Paginated list with filter/sort/search |
| `/stats` | `routes/stats.ts` | Analytics (USWDS adoption, CDN, etc.) |
| `/query` | `routes/query.ts` | SQL interface — SELECT-only, rate-limited (1 req/2s/IP) |
| `/scans` | `routes/scans.ts` | Single/bulk re-scan, diff storage |
| `/proxy` | `routes/proxy.ts` | SSRF-protected outbound HTTP proxy |
| `/gsa` | `routes/gsa.ts` | Import from GSA API; `importFromGsa()` is exported for reuse |
| `/getgov` | `routes/getgov.ts` | .gov domain registration lookup |
| `/briefings` | `routes/briefings.ts` | Retrieve + export Markdown (AI generation removed; POST returns 501) |
| `/scan-sessions` | `routes/scan-sessions.ts` | Bulk scan progress and cancellation |
| `/agencies`, `/bureaus` | `routes/agencies.ts` | Agency/bureau hierarchies; `GET /agencies/resolve?q=` resolves acronyms/nicknames to canonical names |
| `/report` | `routes/report.ts` | Agency → public site data |
| `/scheduler` | `routes/scheduler.ts` | Manage cron jobs (pause/resume/delete) |
| `/chat` | `routes/chat.ts` | Claude chat over the data via tool-use on the REST API (needs `ANTHROPIC_API_KEY`) |
| `/models` | `routes/chat.ts` | Lists Claude models the configured key can access |
| `/api-keys` | `routes/api-keys.ts` | Self-service per-user API keys (label + owner email → hashed token, shown once); accepted by `apiTokenGate` alongside `SCANNER_API_TOKEN`, scoped to `GET` requests only |

Special routes: `/api/v1/settings`, `/api/v1/schema`, `/api/v1/health`, and `/healthz` + `/cache-healthcheck` (VIP liveness, registered first).

`GET /api/v1/schema` is a full machine-readable directory of every route above, generated from `server/src/apiRegistry.ts`. That same registry drives the static `meta.related` navigation links attached to most GET/list/detail responses (via `server/src/apiMeta.ts`'s `metaFor()`). Keep this table and `apiRegistry.ts` in sync when routes change.

## DB Tables

- **`sites`** — 97-column GSA Site Scanner records + computed `is_public` / `is_public_reason`
- **`scan_history`** — Per-scan results with JSON diffs
- **`briefings`** — Generated agency/bureau briefings
- **`scan_sessions`** — Bulk scan tracking (progress, status, error logs); reused by scheduler
- **`settings`** — Key-value runtime config (API keys, endpoints, scheduler settings)
- **`api_keys`** — Self-service per-user API keys (label, owner email, hashed token, created/revoked timestamps + IPs); accepted by `apiTokenGate` alongside `SCANNER_API_TOKEN`, scoped to `GET` requests only

The `is_public` column is auto-refreshed at startup and after GSA imports via `refreshIsPublic()`. `PUBLIC_ONLY_CONDITION` (in `publicFilter.ts`) is the canonical SQL filter for excluding staging, VPN-gated, internal, and non-200 sites — 97 test cases cover its logic.

## Environment Variables

Copy `.env.example` to `.env` at the repo root. Required:

```
VIP_MARIADB_USER
VIP_MARIADB_PASSWORD
VIP_MARIADB_NAME
VIP_MARIADB_WRITE_HOSTS   # e.g., 127.0.0.1:3306
```

Optional: `ANTHROPIC_API_KEY`, `GLEAN_API_KEY`, `GLEAN_ENDPOINT`, `GSA_API_KEY`, `PORT` (default 3001), `AUTH_USER`/`AUTH_PASSWORD` (HTTP Basic Auth in prod), `ALLOWED_ORIGIN`, `ALLOWED_IPS`/`AUTOMATTIC_NETWORK_CIDRS`/`SCANNER_API_TOKEN` (path-scoped access control, prod only — see [ADR 0001](docs/adr/0001-app-level-access-control.md)).

A `docker-compose.yml` is included for spinning up MySQL locally.

## Conventions

**SQL safety:** All queries use parameterized `:name` → `?` conversion via `toPositional()`. Sortable columns are whitelisted to prevent ORDER BY injection.

**Prompt safety:** All user-supplied strings going into LLM prompts must pass through `sanitize.ts` helpers. `encodeForPrompt()` JSON-encodes values to render them as inert data.

**Adding DB columns:** Add to `initDb()` in `server/src/db/index.ts` using the idempotent pattern (catch ER_DUP_FIELDNAME). Also update the Drizzle schema in `schema.ts` and the `SiteRecord` interface in `shared/src/index.ts`.

**Scanner modules:** The server scanner in `server/src/scanner/` mirrors the client scanner in `client/src/scanner/` but with Node.js adaptations. When updating scanning logic, check if both copies need changes.

**Graceful shutdown:** SIGTERM/SIGINT → stop scheduler → drain in-flight requests → exit (25s timeout). Don't register cleanup logic that could block indefinitely.

**Access control:** `ipAllowlistGate` (UI routes) and `apiTokenGate` (`/api/v1/*`) replace VIP's Dashboard-level IP Allow List with app-level, path-scoped rules — see [ADR 0001](docs/adr/0001-app-level-access-control.md) for the full rationale, the dual-path token/IP design, and rotation instructions for `SCANNER_API_TOKEN`.
