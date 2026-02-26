/**
 * Follow redirect chain manually, tracking each hop.
 * Adapted from wp-analyze WebsiteScanner.checkRedirectChain()
 */

import { fetchWithTimeout } from './fetch';
import type { RedirectChainResult, RedirectHop } from 'shared';

const MAX_REDIRECTS = 10;

export async function checkRedirectChain(url: string): Promise<RedirectChainResult> {
  const hops: RedirectHop[] = [];
  let currentUrl = url;
  const visited = new Set<string>();

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    if (visited.has(currentUrl)) break; // Loop detected
    visited.add(currentUrl);

    let response: Response;
    try {
      response = await fetchWithTimeout(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        timeoutMs: 15000,
      });
    } catch {
      // HEAD not supported → fall back to GET
      try {
        response = await fetchWithTimeout(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          timeoutMs: 20000,
        });
      } catch (err: any) {
        throw new Error(`Redirect check failed at ${currentUrl}: ${err.message}`);
      }
    }

    hops.push({
      url: currentUrl,
      status_code: response.status,
      timestamp: new Date().toISOString(),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      try {
        currentUrl = new URL(location, currentUrl).href;
      } catch {
        break; // Invalid URL in Location header
      }
    } else {
      break; // Not a redirect
    }
  }

  const finalUrl = hops.length > 0 ? hops[hops.length - 1].url : url;
  const wasRedirected = hops.length > 1 || (hops.length === 1 && hops[0].url !== url);

  return {
    original_url: url,
    final_url: finalUrl,
    was_redirected: wasRedirected,
    hops,
    total_hops: hops.length,
  };
}
