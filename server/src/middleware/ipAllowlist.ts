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

// Gates non-API, non-agent routes behind the allowed-IP list. Mounted
// globally in index.ts, so it must exempt /api/v1 and /agent itself —
// those paths have their own gate (apiToken.ts) or are deliberately open.
export function ipAllowlistGate(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/v1') || req.path.startsWith('/agent')) {
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
