# ADR 0001: App-Level Path-Scoped Access Control

**Status:** Accepted
**Date:** 2026-08-29

## Context

Access to this app has been restricted via WordPress VIP's Dashboard "IP Allow
List," which blocks at VIP's edge/load balancer before any request reaches
this Node process. That block is:

- **Edge-level** — enforced before the app ever sees the request.
- **Path-blind** — it applies identically to every path, whether it's the
  React UI or a public JSON API endpoint. There's no way to open one surface
  while keeping the other restricted using this feature alone.
- **Identical for WordPress and Node** — it's a VIP platform feature, not
  something either kind of app can override per-route.

The data this app serves (`/api/v1/*`) is entirely public federal government
website scan data — there's no confidentiality requirement, only a desire to
avoid unauthenticated scraping/abuse. But the UI itself (and the `/api/v1/*`
routes that back it) should stay restricted to a known set of IPs, matching
the Dashboard list's current effective behavior.

## Decision

Move access control into the app itself, so the two surfaces can carry
independent rules:

- **UI / non-API routes** — gated by `ipAllowlistGate`
  (`server/src/middleware/ipAllowlist.ts`), which checks the caller's IP
  against `ALLOWED_IPS` (plus `AUTOMATTIC_NETWORK_CIDRS`, see below) and
  returns `403` on a mismatch. Skipped entirely outside `NODE_ENV=production`.
- **`/api/v1/*`** — gated by `apiTokenGate`
  (`server/src/middleware/apiToken.ts`), which requires a valid
  `Authorization: Bearer <SCANNER_API_TOKEN>` header and returns `401` (not
  `403`, so it's distinguishable from the IP gate in logs) on a missing or
  wrong token. Rate-limited by IP (throttling both wrong-token guesses and
  successful calls) so a leaked or guessed token can't become an unbounded
  spam vector.
- **`/agent/*`** — left fully public (no IP gate, no token). It's a
  crawler/agent-facing HTML surface over the same public data, already
  excluded from the documented API registry (`apiRegistry.ts`); requiring a
  token would defeat its anonymous-crawl purpose.

The Dashboard IP Allow List itself is **not** disabled by this change — that
remains a manual, separate VIP Dashboard step, done only after this
middleware is deployed and verified (see Rollout Preconditions below).

### Dual-path on the API gate

`apiTokenGate` admits a request either with a valid token, **or** if the
caller's IP is already in `ALLOWED_IPS`/`AUTOMATTIC_NETWORK_CIDRS` — with no
token required and no rate limit applied in that case. This was necessary
because two existing internal consumers call `/api/v1/*` with no way to
safely carry a secret:

- The React SPA (`client/src/lib/api.ts`) calls `/api/v1/*` directly from the
  browser. Anything shipped in the built JS bundle is visible via
  view-source, and a session/cookie mechanism was explicitly out of scope
  (no user accounts, no login flow).
- The in-app Chat feature (`server/src/services/claude-chat.ts`) calls
  `/api/v1/*` over loopback for its tool-use loop. This traffic *does* attach
  the real token explicitly (loopback has no reason to be in `ALLOWED_IPS`),
  since it's server-side code that already holds the token value.

This softens the literal "no IP check at all" framing for the API gate, but
preserves its real intent: an arbitrary, disallowed IP with a valid token
still succeeds. What's added is that already-trusted (allowed-IP) traffic —
principally the SPA's own browsing — keeps working unmodified, with zero
client-side changes.

### Client IP source

Both gates read the `x-vip-ip` request header, which VIP computes and
forwards to origin applications (WordPress and Node alike) as its resolved
"most probable client IP" — it already applies `True-Client-IP` vs.
leftmost-`X-Forwarded-For` fallback logic internally, so this app doesn't
need `app.set('trust proxy', ...)` or its own fallback chain. Falls back to
`req.socket.remoteAddress` only when the header is absent (local/dev, where
VIP's edge isn't in front of the request).

**Open verification item:** nothing found in VIP's public documentation
explicitly confirms that a client-supplied `X-Vip-IP` header is stripped or
overwritten before reaching the origin. Every gate here trusts this header as
ground truth. Verify this with VIP Support before treating the design as
fully hardened against a spoofed header from a source other than VIP's own
edge.

### The Automattic-network gap

WordPress's `is_proxied_request()` / `A8C_PROXIED_REQUEST` has no documented
Node equivalent — VIP's public `vip-go-mu-plugins` source only shows the
`false` default; the logic that flips it true for genuine Automattic-internal
traffic is proprietary edge infrastructure, not a header or IP range VIP
publishes.

This is implemented as a configurable `AUTOMATTIC_NETWORK_CIDRS` env var
(empty by default), matched with the same CIDR approach as
`ssrf-protection.ts`. It starts empty and is a **no-op** until VIP
Support/TAM supplies real ranges. The server logs a startup warning
(`server/src/index.ts`) when running in production with this list empty, so
the gap is visible to whoever operates the deploy rather than silently
invisible.

### Cache-Control invariant

Both gates set `Cache-Control: private, no-store` on gated responses, since
VIP's edge cache treats Node identically to WordPress (GET/HEAD cached by
default; `private`/`no-cache`/`no-store` all bypass it identically) — without
this, a cached response could let a disallowed IP or tokenless client receive
a stale-but-valid response straight from the edge, skipping both gates
entirely.

**Invariant every `/api/v1` route must preserve:** if a route handler sets
its own `Cache-Control` header (several already do, e.g. `sites.ts`,
`stats.ts`, with `private, max-age=300`), that value replaces the gate's —
Express doesn't merge them. As long as the route's own value still contains
`private`, `no-cache`, or `no-store`, the bypass still holds; a future route
setting a bare `max-age` with none of those tokens would silently reintroduce
a cacheable, gate-skippable response. There is no enforcement of this beyond
this documented invariant and the manual verification step in the plan.

### Token blast radius

`SCANNER_API_TOKEN` gates *all* of `/api/v1/*`, not just read-only public
data — including `PUT /api/v1/settings/:key` (can rewrite
`ANTHROPIC_API_KEY`), `GET /api/v1/settings` (unmasked), `POST
/api/v1/scans`, `PUT /api/v1/sites/:domain`, `PUT /api/v1/scheduler/*`,
`POST /api/v1/gsa/import`, `POST /api/v1/getgov/import`, and `POST
/api/v1/proxy`. A leaked token's blast radius is meaningfully larger than
"someone scrapes public data too fast." This is a conscious tradeoff,
consistent with the "no full auth system" scope of this change — splitting
mutation-capable routes onto a separate, higher-privilege credential is a
candidate follow-up if this token's blast radius becomes a concern in
practice, not something this change implements.

## Where the token lives, and how to rotate it

- `SCANNER_API_TOKEN` is an environment variable only — never hardcoded,
  never stored in the `settings` database table (unlike `ANTHROPIC_API_KEY`),
  so it can't be read back unmasked via `GET /api/v1/settings`.
- **Local dev:** set in `.env` (see `.env.example`). Both gates skip entirely
  outside `NODE_ENV=production`, so a token isn't required for local
  development.
- **Production (VIP):** set as a VIP Dashboard environment variable for the
  environment.
- **To rotate:** set a new value in the VIP Dashboard and redeploy (or use
  VIP's env-var hot-reload if available for this app), then invalidate/stop
  sharing the old value. There is no automated revocation path — if a token
  leak is suspected, rotating it immediately is the only remediation.
- Generate a new token with something like `openssl rand -hex 32`.

## Rollout preconditions

Before disabling the Dashboard IP Allow List (a separate, manual VIP
Dashboard change — not part of this repo):

1. This middleware is deployed and verified working in production (see the
   plan's Implementation Unit verification steps).
2. VIP's edge cache is purged for `/api/v1/*` and UI paths, so no
   pre-existing cached response (built under the old, no-app-level-control
   regime) can keep serving ungated data until its TTL expires.
3. `AUTOMATTIC_NETWORK_CIDRS` is populated with real ranges from VIP
   Support/TAM, **or** the gap is consciously accepted (e.g., Automattic
   engineers needing UI access are added to `ALLOWED_IPS` individually in the
   interim).

Do this out of order and there's a window with no protection at all, or a
silent loss of the Automattic-network exception the Dashboard list currently
provides.

Startup now also warns (does not fail) when `ALLOWED_IPS` or
`SCANNER_API_TOKEN` is empty in production — both are total-lockout
conditions (every UI request 403s, or every non-allowlisted `/api/v1/*`
request 401s, including this app's own in-app Chat feature's loopback
calls), not just the degraded-Automattic-bypass condition the original
warning covered.

`/api/v1/health` (the "legacy — keep for existing clients" liveness check) is
exempted from `apiTokenGate` — a health probe shouldn't require an
operational secret, and it returns no sensitive data. No other `/api/v1/*`
route is exempted; `/api/v1/schema` and `/api/v1/settings` remain gated like
the rest of the API.

## Known, consciously-accepted gaps (surfaced during code review)

- **CSRF-adjacent characteristic of IP-based trust, not new to this change.**
  The dual-path IP-allow branch trusts network location alone, with no
  origin/CSRF-token check, for both reads and mutations. This is the same
  property the Dashboard IP Allow List already had (it's also purely
  IP-based, edge-level) — this change reproduces that trust model in the
  app rather than introducing a new exposure. Worth revisiting if the
  mutation surface under `/api/v1/*` grows, but not addressed here.
- **In-memory rate limiter is per-process, not distributed.** Fine as long as
  this app runs as a single VIP instance (confirmed pattern already accepted
  by `chat.ts`'s existing rate limiter); would need a shared store if this
  app is ever horizontally scaled.
- **`chat.ts`'s own inline rate limiter was not migrated** to the new shared
  `server/src/utils/rateLimit.ts` factory — deliberately out of scope for
  this change (see the plan's Scope Boundaries), not an oversight.

## Reusable pattern

This is intended as a reusable pattern for other VIP Node apps with the same
shape — a public data API that should be open (modulo abuse prevention) and a
UI that should stay IP-gated:

1. Disable (or never rely on) the Dashboard-level, path-blind IP Allow List
   for anything finer-grained than "block or allow the whole app."
2. Add an app-level IP-allowlist gate for UI/non-API routes, reading VIP's
   `x-vip-ip` header directly (no `trust proxy` needed).
3. Add an app-level shared-secret token gate for the public API surface, with
   a dual-path IP-allow bypass if (and only if) the app's own UI calls that
   same API directly from the browser without another way to authenticate.
4. Rate-limit the token path, not the IP-allowed path.
5. Set `Cache-Control: private, no-store` (or equivalent) on every gated
   response, and audit that no downstream handler silently overrides it with
   a cacheable value.
