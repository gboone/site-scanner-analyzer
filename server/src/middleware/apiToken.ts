import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { config } from '../config.js';
import { getClientIp, isIpAllowed, isUnderPath } from './ipAllowlist.js';
import { createRateLimiter } from '../utils/rateLimit.js';
import { hashToken } from '../utils/apiKeys.js';
import { query, execute } from '../db/index.js';

// Throttles the non-allowlisted-IP path only (see apiTokenGate below) — both
// wrong-token guesses and successful token calls count against this limit,
// so repeated guessing can't dodge it by never actually succeeding.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const checkRateLimit = createRateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

// Pure — hashes both sides to a fixed length before comparing so mismatched
// raw lengths never throw or short-circuit crypto.timingSafeEqual. Fails
// closed when `expected` is unset: an empty token is never "no token required".
export function isValidToken(provided: string | undefined, expected: string): boolean {
  if (!expected) return false;
  return crypto.timingSafeEqual(sha256(provided ?? ''), sha256(expected));
}

function parseBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length).trim();
}

// Pure — whether a fetched api_keys row (if any) counts as a valid, non-revoked
// credential. Split out from the DB lookup itself so this decision is
// unit-testable without a live database, mirroring isValidToken above.
export function isValidKeyRow(row: { revoked_at: string | null } | undefined): boolean {
  return !!row && row.revoked_at == null;
}

// A self-issued per-user key is scoped to read-only GET requests, and
// explicitly excluded from /settings (its GET route returns unmasked secrets)
// and /api-keys (a key shouldn't be usable to enumerate/revoke other keys).
// See docs/adr/0001-app-level-access-control.md's "Per-user API keys" addendum.
function isInPerUserKeyScope(req: Request): boolean {
  return req.method === 'GET' && !isUnderPath(req.path, '/settings') && !isUnderPath(req.path, '/api-keys');
}

// Gates /api/v1/* — dual-path: an IP already in ALLOWED_IPS/AUTOMATTIC_NETWORK_CIDRS
// is admitted with no token and no rate limit (keeps the existing SPA and
// crawler-adjacent internal traffic working unmodified); everyone else needs
// a valid SCANNER_API_TOKEN (any route) or a valid per-user key (GET routes
// only, see isInPerUserKeyScope), rate-limited by IP.
// See docs/adr/0001-app-level-access-control.md.
export async function apiTokenGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Legacy liveness check "kept for existing clients" (see index.ts) — a health
  // probe shouldn't require an operational secret, and it returns no sensitive data.
  // req.path here is relative to this middleware's /api/v1 mount point (Express
  // strips the mount prefix), so '/health' is the full remainder for /api/v1/health.
  if (req.path === '/health') {
    next();
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  res.set('Cache-Control', 'private, no-store');
  const ip = getClientIp(req);

  if (isIpAllowed(ip, config.allowedIps, config.automatticNetworkCidrs)) {
    next();
    return;
  }

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const token = parseBearerToken(req.headers.authorization);
  if (isValidToken(token, config.scannerApiToken)) {
    next();
    return;
  }

  if (token && isInPerUserKeyScope(req)) {
    try {
      const hash = hashToken(token);
      const rows = await query<{ id: number; revoked_at: string | null }>(
        'SELECT id, revoked_at FROM api_keys WHERE token_hash = :hash',
        { hash }
      );
      if (isValidKeyRow(rows[0])) {
        execute(
          "UPDATE api_keys SET last_used_at = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%SZ') WHERE id = :id",
          { id: rows[0].id }
        ).catch(() => {});
        next();
        return;
      }
    } catch {
      // fall through to 401 — a DB error must never bypass the fail-closed default
    }
  }

  res.status(401).json({ error: 'invalid_token' });
}
