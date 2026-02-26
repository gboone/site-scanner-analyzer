/**
 * DNS resolution via Cloudflare DoH (DNS over HTTPS).
 * Adapted from wp-analyze DNSResolver.resolve()
 */
import type { DnsResult } from 'shared';

const DOH_URL = 'https://cloudflare-dns.com/dns-query';

interface DohResponse {
  Answer?: Array<{ type: number; data: string }>;
}

async function dohQuery(name: string, type: number): Promise<string[]> {
  try {
    const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = await response.json() as DohResponse;
    return (data.Answer || []).map((a) => a.data).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Infer hosting provider from NS record hostnames and A record IPs.
 * Ordered by specificity — first match wins.
 */
function inferHostingProvider(nsRecords: string[], aRecords: string[]): string | null {
  const ns = nsRecords.map(r => r.toLowerCase()).join(' ');
  const ips = aRecords.join(' ');

  // Cloud / CDN (NS-based)
  if (ns.includes('awsdns')) return 'Amazon Web Services (Route 53)';
  if (ns.includes('azure-dns') || ns.includes('azure.com')) return 'Microsoft Azure';
  if (ns.includes('googledomains') || ns.includes('cloud-dns') || ns.includes('google.com')) return 'Google Cloud';
  if (ns.includes('cloudflare')) return 'Cloudflare';
  if (ns.includes('fastly')) return 'Fastly';
  if (ns.includes('akam.net') || ns.includes('akamai')) return 'Akamai';

  // Government / GSA hosting
  if (ns.includes('cloud.gov') || ns.includes('digitalgov')) return 'GSA cloud.gov';
  if (ns.includes('dhs.gov') || ns.includes('cisa')) return 'DHS / CISA';
  if (ns.includes('.mil')) return 'DoD / .mil';

  // Managed WP / CMS platforms
  if (ns.includes('automattic') || ns.includes('wordpress.com') || ns.includes('vipv2')) return 'WordPress VIP (Automattic)';
  if (ns.includes('wpengine')) return 'WP Engine';
  if (ns.includes('pantheon')) return 'Pantheon';
  if (ns.includes('acquia')) return 'Acquia';
  if (ns.includes('kinsta')) return 'Kinsta';
  if (ns.includes('pagely')) return 'Pagely';
  if (ns.includes('flywheel')) return 'Flywheel';

  // Traditional hosting
  if (ns.includes('godaddy') || ns.includes('domaincontrol.com')) return 'GoDaddy';
  if (ns.includes('bluehost')) return 'Bluehost';
  if (ns.includes('siteground')) return 'SiteGround';
  if (ns.includes('hostgator')) return 'HostGator';
  if (ns.includes('dreamhost')) return 'DreamHost';
  if (ns.includes('namecheap')) return 'Namecheap';
  if (ns.includes('rackspace')) return 'Rackspace';
  if (ns.includes('linode')) return 'Linode / Akamai Cloud';
  if (ns.includes('digitalocean')) return 'DigitalOcean';

  // IP-range fallback (rough heuristics — A/AAAA records reflect origin host)
  if (/\b(54|52|34|18|3)\.\d+\.\d+\.\d+/.test(ips)) return 'Amazon Web Services';
  if (/\b(13\.107|40\.|20\.|52\.152)/.test(ips)) return 'Microsoft Azure';
  if (/\b(35\.|104\.196\.|130\.211\.)/.test(ips)) return 'Google Cloud';
  if (/\b(104\.16\.|172\.64\.|104\.21\.)/.test(ips)) return 'Cloudflare';

  return null;
}

export async function resolveDns(hostname: string): Promise<DnsResult> {
  const [aRecords, aaaaRecords, mxRecords, nsRecords] = await Promise.all([
    dohQuery(hostname, 1),   // A
    dohQuery(hostname, 28),  // AAAA
    dohQuery(hostname, 15),  // MX
    dohQuery(hostname, 2),   // NS
  ]);

  return {
    a_records: aRecords,
    aaaa_records: aaaaRecords,
    mx_records: mxRecords,
    ns_records: nsRecords,
    ipv6: aaaaRecords.length > 0,
    hosting_provider: inferHostingProvider(nsRecords, aRecords),
  };
}
