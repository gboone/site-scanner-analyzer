/**
 * Main scan orchestrator.
 * Runs all scanner modules in sequence/parallel and reports progress.
 */

import { checkRedirectChain } from './redirectChain';
import { analyzeSitemap } from './sitemap';
import { fetchRobotsTxt } from './robots';
import { detectTech } from './techDetector';
import { resolveDns } from './dns';
import { checkHostingProvider } from './wellKnown';
import type { ScanResult } from 'shared';

export type { ScanResult };

export async function scanSite(
  url: string,
  onProgress?: (step: string, done: boolean) => void
): Promise<ScanResult> {
  const start = Date.now();
  const errors: string[] = [];

  const result: ScanResult = {
    domain: url,
    scanned_at: new Date().toISOString(),
    status: 'completed',
    redirect_chain: null,
    sitemap: null,
    robots: null,
    tech_stack: null,
    dns: null,
    errors,
    duration_ms: 0,
    live: null,
  };

  // Step 1: Redirect chain (sequential — needed for finalUrl)
  onProgress?.('redirect', false);
  try {
    result.redirect_chain = await checkRedirectChain(url);
  } catch (err: any) {
    errors.push(`redirect: ${err.message}`);
  }
  onProgress?.('redirect', true);

  const finalUrl = result.redirect_chain?.final_url ?? url;

  // Steps 2-6: Run in parallel
  // wellKnownProvider is captured here so the post-allSettled priority merge
  // can apply it unconditionally — avoids a race where the DNS IIFE's inline
  // merge runs after .well-known but before allSettled returns.
  let wellKnownProvider: string | null = null;

  await Promise.allSettled([
    (async () => {
      onProgress?.('sitemap', false);
      try {
        result.sitemap = await analyzeSitemap(finalUrl);
      } catch (err: any) {
        errors.push(`sitemap: ${err.message}`);
      }
      onProgress?.('sitemap', true);
    })(),

    (async () => {
      onProgress?.('robots', false);
      try {
        result.robots = await fetchRobotsTxt(finalUrl);
      } catch (err: any) {
        errors.push(`robots: ${err.message}`);
      }
      onProgress?.('robots', true);
    })(),

    (async () => {
      onProgress?.('tech', false);
      try {
        result.tech_stack = await detectTech(finalUrl);
      } catch (err: any) {
        errors.push(`tech: ${err.message}`);
      }
      onProgress?.('tech', true);
    })(),

    (async () => {
      onProgress?.('dns', false);
      try {
        const hostname = new URL(finalUrl).hostname;
        result.dns = await resolveDns(hostname);
      } catch (err: any) {
        errors.push(`dns: ${err.message}`);
      }
      onProgress?.('dns', true);
    })(),

    (async () => {
      try {
        wellKnownProvider = await checkHostingProvider(finalUrl);
      } catch { /* silent — well-known is best-effort */ }
    })(),
  ]);

  // Priority merge for hosting_provider (post-allSettled so all signals are in):
  // 1. .well-known/hosting-provider (authoritative declaration by the host operator)
  // 2. DNS NS/IP inference (useful heuristic, but NS ≠ origin host)
  if (result.tech_stack) {
    if (wellKnownProvider) {
      result.tech_stack.hosting_provider = wellKnownProvider;
    } else if (result.dns?.hosting_provider) {
      result.tech_stack.hosting_provider = result.dns.hosting_provider;
    }
  }

  // Compute liveness after all parallel modules have settled.
  // Conditions (all must be true):
  //   1. Redirect chain reached a 2xx response
  //   2. Tech detector did not identify the landing page as an auth gate
  //   3. No HTTP 401 (Basic Auth) — covered by condition 1, since 401 is 4xx
  const hops = result.redirect_chain?.hops;
  if (hops && hops.length > 0) {
    const finalStatus = hops[hops.length - 1].status_code;
    const is2xx = finalStatus >= 200 && finalStatus < 300;
    const loginGate = result.tech_stack?.login_gate ?? false;
    result.live = is2xx && !loginGate;
  }

  result.status = errors.length === 0 ? 'completed' : errors.length < 3 ? 'partial' : 'failed';
  result.duration_ms = Date.now() - start;
  return result;
}
