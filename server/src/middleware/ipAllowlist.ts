import { Request, Response, NextFunction } from 'express';
import * as ipaddr from 'ipaddr.js';
import { config } from '../config.js';

// VIP computes and forwards this header as the resolved client IP for origin
// apps (Node included) — see docs/adr/0001-app-level-access-control.md.
export function getClientIp(req: Request): string {
  const header = req.headers['x-vip-ip'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return fromHeader || req.socket.remoteAddress || '';
}

function matchesAny(ip: string, entries: string[]): boolean {
  let parsedIp: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsedIp = ipaddr.parse(ip);
  } catch {
    return false;
  }

  for (const entry of entries) {
    try {
      if (entry.includes('/')) {
        const [rangeAddr, bits] = ipaddr.parseCIDR(entry);
        if (parsedIp.kind() !== rangeAddr.kind()) continue;
        if (parsedIp.match(rangeAddr as ipaddr.IPv4 & ipaddr.IPv6, bits)) return true;
      } else {
        const single = ipaddr.parse(entry);
        if (parsedIp.kind() === single.kind() && parsedIp.toString() === single.toString()) return true;
      }
    } catch {
      continue; // skip malformed entries rather than failing the whole check
    }
  }
  return false;
}

// Pure, Express-free — reused by apiToken.ts's dual-path check.
export function isIpAllowed(ip: string, allowedCidrs: string[], automatticCidrs: string[]): boolean {
  return matchesAny(ip, allowedCidrs) || matchesAny(ip, automatticCidrs);
}

// Returns the entries that don't parse as a bare IP or CIDR range, so a startup
// check can warn about a typo'd config value instead of it being silently
// skipped forever inside matchesAny's catch.
export function findMalformedEntries(entries: string[]): string[] {
  return entries.filter((entry) => {
    try {
      if (entry.includes('/')) {
        ipaddr.parseCIDR(entry);
      } else {
        ipaddr.parse(entry);
      }
      return false;
    } catch {
      return true;
    }
  });
}

// Exported for reuse by apiToken.ts's per-user-key route scoping.
//
// Case-insensitive on purpose: Express's own route matching is case-insensitive
// by default (no `case sensitive routing` setting is set anywhere in this app),
// so `GET /api/v1/SETTINGS` still resolves to the real /api/v1/settings handler
// even though req.path preserves the caller's original casing. A case-sensitive
// prefix check here would let a differently-cased path slip past both this
// function's callers (ipAllowlistGate's /api/v1 exemption and apiTokenGate's
// per-user-key /settings and /api-keys exclusion) while Express still routes it
// to the real handler underneath — reopening exactly the privilege-escalation
// gap the per-user-key scoping exists to close. Confirmed via code review.
export function isUnderPath(path: string, prefix: string): boolean {
  const normalizedPath = path.toLowerCase();
  const normalizedPrefix = prefix.toLowerCase();
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

// Gates non-API, non-agent, non-mcp routes behind the allowed-IP list. Mounted
// globally in index.ts, so it must exempt /api/v1, /agent, and /mcp themselves —
// those paths have their own gate (apiToken.ts) or are deliberately open. /mcp
// in particular is called by external Claude Desktop/Code clients that will
// never be on an allowed IP, so it must rely solely on its own token gate.
export function ipAllowlistGate(req: Request, res: Response, next: NextFunction): void {
  if (isUnderPath(req.path, '/api/v1') || isUnderPath(req.path, '/agent') || isUnderPath(req.path, '/mcp')) {
    next();
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ip = getClientIp(req);
  res.set('Cache-Control', 'private, no-store');
  if (isIpAllowed(ip, config.allowedIps, config.automatticNetworkCidrs)) {
    next();
    return;
  }
  res.status(403).json({ error: 'ip_not_allowed' });
}
