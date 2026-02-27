/**
 * Checks the .well-known/hosting-provider path for an authoritative
 * declaration of the site's hosting provider.
 *
 * This is the highest-priority signal for hosting detection — if the
 * host operator has published this file, its value wins over DNS or
 * IP-range heuristics.
 *
 * See: https://well-known.dev/
 */
import { fetchWithTimeout } from './fetch';

export async function checkHostingProvider(baseUrl: string): Promise<string | null> {
  try {
    const url = new URL('/.well-known/hosting-provider', baseUrl).href;
    const res = await fetchWithTimeout(url, { timeoutMs: 6000 });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    // Reject empty, suspiciously long, or HTML responses (error pages)
    if (!text || text.length > 100 || text.includes('<')) return null;
    return text;
  } catch {
    return null;
  }
}
