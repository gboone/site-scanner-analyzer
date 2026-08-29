import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { config } from '../config.js';
import { getClientIp, isIpAllowed } from './ipAllowlist.js';
import { createRateLimiter } from '../utils/rateLimit.js';

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

// Gates /api/v1/* — dual-path: an IP already in ALLOWED_IPS/AUTOMATTIC_NETWORK_CIDRS
// is admitted with no token and no rate limit (keeps the existing SPA and
// crawler-adjacent internal traffic working unmodified); everyone else needs
// a valid SCANNER_API_TOKEN, rate-limited by IP. See docs/adr/0001-app-level-access-control.md.
export function apiTokenGate(req: Request, res: Response, next: NextFunction): void {
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
  if (!isValidToken(token, config.scannerApiToken)) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  next();
}
