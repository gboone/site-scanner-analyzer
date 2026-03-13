const CRTSH_TIMEOUT_MS = 15_000;

/**
 * Discover subdomains of a base domain using Certificate Transparency logs (crt.sh).
 * Returns an empty array on any error — caller should not block on this.
 */
export async function discoverSubdomains(baseDomain: string): Promise<string[]> {
  try {
    const url = `https://crt.sh/?q=%.${baseDomain}&output=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRTSH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return [];

    const data: Array<{ name_value?: string }> = await res.json();
    const suffix = `.${baseDomain}`;
    const found = new Set<string>();

    for (const entry of data) {
      if (!entry.name_value) continue;
      for (const name of entry.name_value.split('\n')) {
        const host = name.trim().toLowerCase();
        // Skip wildcards and any name that doesn't end with .baseDomain
        if (host.startsWith('*.') || !host.endsWith(suffix)) continue;
        // Must be a valid subdomain (no spaces, no slashes)
        if (/\s|\//.test(host)) continue;
        if (host === baseDomain) continue;
        found.add(host);
      }
    }

    return [...found];
  } catch {
    return [];
  }
}
