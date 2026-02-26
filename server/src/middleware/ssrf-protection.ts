import { Request, Response, NextFunction } from 'express';
import * as dns from 'dns/promises';
import * as ipaddr from 'ipaddr.js';

const BLOCKED_CIDRS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '100.64.0.0/10', // Carrier-grade NAT
  '0.0.0.0/8',
  '240.0.0.0/4',
];

const BLOCKED_IPV6_CIDRS = [
  '::1/128',
  'fc00::/7',
  'fe80::/10',
  '::ffff:0:0/96', // IPv4-mapped
];

function isPrivateIp(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv4') {
      for (const cidr of BLOCKED_CIDRS) {
        const [net, bits] = cidr.split('/');
        if (parsed.match(ipaddr.parse(net) as ipaddr.IPv4, parseInt(bits))) {
          return true;
        }
      }
    } else {
      for (const cidr of BLOCKED_IPV6_CIDRS) {
        const [net, bits] = cidr.split('/');
        if (parsed.match(ipaddr.parse(net) as ipaddr.IPv6, parseInt(bits))) {
          return true;
        }
      }
    }
  } catch {
    return true; // Block unparseable IPs
  }
  return false;
}

export async function ssrfProtection(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { url } = req.body as { url?: string };

  if (!url) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.status(400).json({ error: 'Only HTTP and HTTPS protocols are allowed' });
    return;
  }

  const hostname = parsed.hostname;

  // Block metadata service and known internal hostnames
  const blockedHostnames = ['localhost', 'metadata.google.internal', '169.254.169.254'];
  if (blockedHostnames.includes(hostname.toLowerCase())) {
    res.status(403).json({ error: 'SSRF protection: blocked hostname' });
    return;
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true, family: 0 });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        res.status(403).json({ error: `SSRF protection: private IP address blocked (${address})` });
        return;
      }
    }
  } catch {
    res.status(400).json({ error: 'Could not resolve hostname' });
    return;
  }

  next();
}
