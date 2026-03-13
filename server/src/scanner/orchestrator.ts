/**
 * Server-side scan orchestrator.
 * Runs all scanner modules and stores the result directly to the database,
 * mirroring the logic of POST /api/v1/scans.
 */

import { checkRedirectChain } from './redirectChain';
import { analyzeSitemap } from './sitemap';
import { fetchRobotsTxt } from './robots';
import { detectTech } from './techDetector';
import { resolveDns } from './dns';
import { checkHostingProvider } from './wellKnown';
import { query, execute } from '../db';
import type { ScanResult } from 'shared';

export type { ScanResult };

async function runScan(url: string): Promise<ScanResult> {
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
  try {
    result.redirect_chain = await checkRedirectChain(url);
  } catch (err: any) {
    errors.push(`redirect: ${err.message}`);
  }

  const finalUrl = result.redirect_chain?.final_url ?? url;
  let wellKnownProvider: string | null = null;

  await Promise.allSettled([
    (async () => {
      try { result.sitemap = await analyzeSitemap(finalUrl); }
      catch (err: any) { errors.push(`sitemap: ${err.message}`); }
    })(),
    (async () => {
      try { result.robots = await fetchRobotsTxt(finalUrl); }
      catch (err: any) { errors.push(`robots: ${err.message}`); }
    })(),
    (async () => {
      try { result.tech_stack = await detectTech(finalUrl); }
      catch (err: any) { errors.push(`tech: ${err.message}`); }
    })(),
    (async () => {
      try {
        const hostname = new URL(finalUrl).hostname;
        result.dns = await resolveDns(hostname);
      } catch (err: any) { errors.push(`dns: ${err.message}`); }
    })(),
    (async () => {
      try { wellKnownProvider = await checkHostingProvider(finalUrl); }
      catch { /* silent */ }
    })(),
  ]);

  if (result.tech_stack) {
    if (wellKnownProvider) {
      result.tech_stack.hosting_provider = wellKnownProvider;
    } else if (result.dns?.hosting_provider) {
      result.tech_stack.hosting_provider = result.dns.hosting_provider;
    }
  }

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

// ---------------------------------------------------------------------------
// Public-site classifier — JS mirror of PUBLIC_ONLY_CONDITION in publicFilter.ts
// ---------------------------------------------------------------------------

// Non-production environment subdomain prefixes (mirrors PUBLIC_ONLY_CONDITION domain block)
const NON_PROD_PREFIXES = [
  'staging.', 'uat.', 'test.', 'dev.', 'demo.', 'qa.', 'stg.',
  'sit.', 'preprod.', 'pre-prod.', 'sandbox.', 'training.',
  'www-test.', 'www-dev.', 'www-stg.',
];
const NON_PROD_INFIX = [
  '.staging.', '.uat.', '.test.', '.dev.', '.demo.', '.qa.', '.stg.',
  '-staging.', '-uat.', '-test.', '-dev.', '-demo.',
];
// Internal-access / file-transfer / vendor portal domain prefixes
const INTERNAL_PREFIXES = [
  'ftp.', 'sftp.', 'files.', 'sharefiles.',
  'mail.', 'webmail.',
  'owa.', 'exchange.',
  'horizon.',
];
// VPN / remote-access portal domain prefixes and infixes
const VPN_PREFIXES = [
  'vpn.', 'vpngateway.', 'webvpn.', 'sslvpn.', 'remote.', 'citrix.',
  'pulse.', 'anyconnect.', 'connect.', 'access.',
];
const VPN_INFIX = ['.vpn.', '-vpn.'];
// Title patterns that indicate a non-public page (mirrors the SQL title block)
const BAD_TITLE_PATTERNS = [
  // Auth / credential gates
  'login', 'log in', 'sign in', 'sign-in', 'request rejected', 'access denied',
  'unauthorized', 'invalid credentials', 'authentication required', 'please authenticate',
  'two-factor', 'two factor', 'multi-factor',
  // Access-restriction banners
  'internal access', 'internal use only', 'for internal use', 'internal only',
  'restricted access', 'for authorized personnel', 'authorized users only',
  'employees only', 'staff only', 'for official use only',
  // FTP / file browsers
  'index of /', 'directory listing', 'parent directory',
  'ftp server', 'file browser', 'webdav',
  // Error pages
  'service unavailable', 'bad gateway', 'temporarily unavailable',
  'site is offline', 'under maintenance',
  // Generic server / infrastructure pages
  'default website', 'welcome to iis', 'welcome to default',
  'outlook', 'webmail', 'forbidden', 'page not found',
  // Operations / support-desk portals
  'operations portal', 'operations center', 'network operations',
  'security operations center', 'ops portal',
  'help desk', 'helpdesk', 'service desk', 'servicedesk',
  // Vendor-specific internal tools
  'vmware', 'horizon view', 'workspace one', 'jira service', 'servicenow',
  // IT security banners
  'it security', 'unauthorized access is prohibited', 'computer fraud',
  'information systems security',
  // MAX.gov / OMB collaboration portals
  'max.gov', 'max portal', 'maxportal', 'max auth', 'maxauth', 'omb max',
  // Git / version-control auth screens
  'gitlab', 'gitea', 'gogs', 'sign in · git',
  // VPN / remote-access product login screens
  'vpn', 'anyconnect', 'ssl vpn', 'webvpn', 'citrix',
  'pulse secure', 'globalprotect', 'remote access', 'juniper network',
];

function computeIsPublic(domain: string, scan: ScanResult): 0 | 1 {
  const rc = scan.redirect_chain as any;
  const ts = scan.tech_stack as any;

  const isRedirect = rc?.was_redirected === true;
  const isLive     = scan.live === true;
  const statusCode = Array.isArray(rc?.hops) && rc.hops.length > 0
    ? rc.hops[rc.hops.length - 1]?.status_code ?? null
    : null;
  const isLogin    = ts?.login_gate === true;
  const title      = (ts?.title ?? '').toLowerCase();

  // Must be live, not a redirect, and return 200
  if (!isLive || isRedirect) return 0;
  if (statusCode !== null && statusCode !== 200) return 0;
  if (isLogin) return 0;

  // base_domain check: must be a .gov domain
  // The domain parameter IS the full domain; all .gov subdomains end in .gov
  if (!domain.toLowerCase().endsWith('.gov')) return 0;

  // Auth-credential errors on sitemap / robots indicate a gated site.
  // www_scan_status is a GSA field not available at scan time — covered by live check above.
  const sitemapStatus = (scan.sitemap as any)?.status_code;
  const robotsStatus  = (scan.robots as any)?.status_code;
  if (sitemapStatus === 401 || sitemapStatus === 403) return 0;
  if (robotsStatus  === 401 || robotsStatus  === 403) return 0;

  // Domain-pattern checks
  const d = domain.toLowerCase();
  if (NON_PROD_PREFIXES.some(p => d.startsWith(p))) return 0;
  if (NON_PROD_INFIX.some(p => d.includes(p))) return 0;
  if (INTERNAL_PREFIXES.some(p => d.startsWith(p))) return 0;
  if (VPN_PREFIXES.some(p => d.startsWith(p))) return 0;
  if (VPN_INFIX.some(p => d.includes(p))) return 0;

  // Title-pattern checks
  if (title && BAD_TITLE_PATTERNS.some(p => title.includes(p))) return 0;

  return 1;
}

const BOT_CHALLENGE_TITLE_PATTERNS = [
  'checking your browser', 'just a moment', 'attention required',
  'please wait while we check', 'ddos protection', 'security check',
];

function isBotChallenge(scanResult: ScanResult): boolean {
  const hops = scanResult?.redirect_chain?.hops;
  if (!Array.isArray(hops) || hops.length === 0) return false;
  const finalStatus: number = hops[hops.length - 1]?.status_code ?? 0;
  if (finalStatus < 400) return false;
  const title: string = ((scanResult?.tech_stack as any)?.title ?? '').toLowerCase();
  return BOT_CHALLENGE_TITLE_PATTERNS.some(p => title.includes(p));
}

/**
 * Scan a domain and store the result in scan_history + update sites.
 * Used by the server-side scheduler.
 */
export async function scanAndStore(domain: string, url: string): Promise<{ scan_id: number }> {
  // Ensure the site row exists
  await execute('INSERT IGNORE INTO sites (domain) VALUES (?)', [domain]);

  const scan_result = await runScan(url || `https://${domain}`);
  const now = new Date().toISOString();

  const scanInsert = await execute(`
    INSERT INTO scan_history (domain, scanned_at, status, redirect_chain, sitemap_result, robots_result, tech_stack, dns_records, diff_summary, error_log, duration_ms)
    VALUES (:domain, :scanned_at, :status, :redirect_chain, :sitemap_result, :robots_result, :tech_stack, :dns_records, :diff_summary, :error_log, :duration_ms)
  `, {
    domain,
    scanned_at: now,
    status: scan_result.status || 'completed',
    redirect_chain:  scan_result.redirect_chain ? JSON.stringify(scan_result.redirect_chain) : null,
    sitemap_result:  scan_result.sitemap        ? JSON.stringify(scan_result.sitemap)         : null,
    robots_result:   scan_result.robots         ? JSON.stringify(scan_result.robots)          : null,
    tech_stack:      scan_result.tech_stack     ? JSON.stringify(scan_result.tech_stack)      : null,
    dns_records:     scan_result.dns            ? JSON.stringify(scan_result.dns)             : null,
    diff_summary:    null,
    error_log:       scan_result.errors?.length ? JSON.stringify(scan_result.errors)          : null,
    duration_ms:     scan_result.duration_ms    ?? null,
  });
  const scan_id = scanInsert.insertId;

  if (isBotChallenge(scan_result)) {
    return { scan_id };
  }

  const updates: Record<string, unknown> = { updated_at: now };

  if (scan_result.tech_stack) {
    const ts = scan_result.tech_stack as any;
    if (ts.cms !== undefined) updates.cms = ts.cms;
    if (ts.https_enforced !== undefined) updates.https_enforced = ts.https_enforced ? 1 : 0;
    if (ts.hsts !== undefined) updates.hsts = ts.hsts ? 1 : 0;
    if (ts.web_server !== undefined) updates.web_server = ts.web_server;
    if (ts.cdn !== undefined) updates.cdn_provider = ts.cdn;
    if (ts.hosting_provider != null) updates.hosting_provider = ts.hosting_provider;
    if (ts.analytics !== undefined) updates.analytics_platforms = JSON.stringify(ts.analytics);
    if (ts.uswds) {
      const u = ts.uswds;
      if (u.count !== undefined) updates.uswds_count = u.count;
      if (u.usa_classes !== undefined) updates.uswds_usa_classes = u.usa_classes;
      if (u.favicon !== undefined) updates.uswds_favicon = u.favicon;
      if (u.favicon_in_css !== undefined) updates.uswds_favicon_in_css = u.favicon_in_css;
      if (u.publicsans_font !== undefined) updates.uswds_publicsans_font = u.publicsans_font;
      if (u.inpage_css !== undefined) updates.uswds_inpage_css = u.inpage_css;
      if (u.string !== undefined) updates.uswds_string = u.string;
      if (u.string_in_css !== undefined) updates.uswds_string_in_css = u.string_in_css;
      if (u.version !== undefined) updates.uswds_version = u.version;
      if (u.semantic_version !== undefined) updates.uswds_semantic_version = u.semantic_version;
      if (u.banner_heres_how !== undefined) updates.uswds_banner_heres_how = u.banner_heres_how ? 1 : 0;
      if (u.usa_class_list !== undefined) updates.uswds_usa_class_list = JSON.stringify(u.usa_class_list);
    }
    if (ts.dap) {
      const d = ts.dap;
      if (d.detected !== undefined) updates.dap = d.detected ? 1 : 0;
      if (d.parameters !== undefined) updates.dap_parameters = JSON.stringify(d.parameters);
      if (d.version !== undefined) updates.dap_version = d.version;
      if (d.ga_tag_id !== undefined) updates.ga_tag_id = d.ga_tag_id;
    }
    if (ts.wordpress) {
      const wp = ts.wordpress;
      if (wp.version != null) updates.wp_version = wp.version;
      if (wp.theme != null) updates.wp_theme = wp.theme;
      if (wp.theme_version != null) updates.wp_theme_version = wp.theme_version;
      if (wp.plugins !== undefined) updates.wp_plugins = JSON.stringify(wp.plugins);
      if (wp.content) {
        const wpc = wp.content;
        updates.wp_json_api_active = wpc.json_api_active ? 1 : 0;
        if (wpc.json_api_endpoints?.length) updates.wp_api_endpoints = JSON.stringify(wpc.json_api_endpoints);
        if (wpc.post_count != null) updates.wp_post_count = wpc.post_count;
        if (wpc.page_count != null) updates.wp_page_count = wpc.page_count;
        if (wpc.author_count != null) updates.wp_author_count = wpc.author_count;
        if (wpc.category_count != null) updates.wp_category_count = wpc.category_count;
        if (wpc.tag_count != null) updates.wp_tag_count = wpc.tag_count;
        if (wpc.media_total != null) updates.wp_media_total = wpc.media_total;
        if (wpc.media_size_bytes != null) updates.wp_media_size_bytes = wpc.media_size_bytes;
        if (wpc.media_size_formatted != null) updates.wp_media_size_formatted = wpc.media_size_formatted;
        if (wpc.detected_plugins?.length) updates.wp_plugins_detailed = JSON.stringify(wpc.detected_plugins);
        if (wpc.feeds?.length) updates.wp_feeds = JSON.stringify(wpc.feeds);
        if (wpc.custom_post_types?.length) updates.wp_custom_post_types = JSON.stringify(wpc.custom_post_types);
      }
    }
    if (ts.technologies?.length) updates.detected_technologies = JSON.stringify(ts.technologies);
    if (ts.security_headers) {
      if (ts.security_headers.csp != null) updates.security_header_csp = ts.security_headers.csp;
      if (ts.security_headers.xss_protection != null) updates.security_header_xss = ts.security_headers.xss_protection;
    }
  }

  if (scan_result.sitemap) {
    const s = scan_result.sitemap as any;
    if (s.detected !== undefined) updates.sitemap_xml_detected = s.detected ? 1 : 0;
    if (s.status_code !== undefined) updates.sitemap_xml_status_code = s.status_code;
    if (s.page_count !== undefined) updates.sitemap_xml_count = s.page_count;
    if (s.pdf_count !== undefined) updates.sitemap_xml_pdf_count = s.pdf_count;
    if (s.filesize !== undefined) updates.sitemap_xml_filesize = s.filesize;
    if (s.lastmod !== undefined) updates.sitemap_xml_lastmod = s.lastmod;
    if (s.sitemaps_found != null) updates.sitemap_sitemaps_found = s.sitemaps_found;
    if (s.content_types) updates.sitemap_content_types = JSON.stringify(s.content_types);
    if (s.url_patterns?.length) updates.sitemap_url_patterns = JSON.stringify(s.url_patterns);
    if (s.publishing_by_year) updates.sitemap_publishing_by_year = JSON.stringify(s.publishing_by_year);
    if (s.publishing_by_month) updates.sitemap_publishing_by_month = JSON.stringify(s.publishing_by_month);
    if (s.latest_update != null) updates.sitemap_latest_update = s.latest_update;
    if (s.has_clean_urls != null) updates.sitemap_has_clean_urls = s.has_clean_urls ? 1 : 0;
    if (s.path_depth_avg != null) updates.sitemap_path_depth_avg = s.path_depth_avg;
  }

  if (scan_result.robots) {
    const r = scan_result.robots as any;
    if (r.detected !== undefined) updates.robots_txt_detected = r.detected ? 1 : 0;
    if (r.status_code !== undefined) updates.robots_txt_status_code = r.status_code;
    if (r.filesize !== undefined) updates.robots_txt_filesize = r.filesize;
    if (r.crawl_delay !== undefined) updates.robots_txt_crawl_delay = r.crawl_delay;
    if (r.sitemap_locations !== undefined) updates.robots_txt_sitemap_locations = JSON.stringify(r.sitemap_locations);
  }

  if (scan_result.redirect_chain) {
    const rc = scan_result.redirect_chain as any;
    if (rc.was_redirected !== undefined) updates.redirect = rc.was_redirected ? 1 : 0;
    if (rc.final_url !== undefined) updates.url = rc.final_url;
    if (Array.isArray(rc.hops) && rc.hops.length > 0) {
      updates.status_code = rc.hops[rc.hops.length - 1].status_code;
    }
  }

  if (scan_result.live !== undefined && scan_result.live !== null) {
    updates.live = scan_result.live ? 1 : 0;
  }

  if (scan_result.dns) {
    const d = scan_result.dns as any;
    if (d.ipv6 !== undefined) updates.ipv6 = d.ipv6 ? 1 : 0;
    if (d.a_records !== undefined) updates.dns_a_records = JSON.stringify(d.a_records);
    if (d.aaaa_records !== undefined) updates.dns_aaaa_records = JSON.stringify(d.aaaa_records);
    if (d.mx_records !== undefined) updates.dns_mx_records = JSON.stringify(d.mx_records);
    if (d.ns_records !== undefined) updates.dns_ns_records = JSON.stringify(d.ns_records);
    if (d.hosting_provider != null && !updates.hosting_provider) {
      updates.hosting_provider = d.hosting_provider;
    }
  }

  updates.is_public = computeIsPublic(domain, scan_result);
  updates.last_scan_id = scan_id;
  const cols = Object.keys(updates).filter(k => k !== 'domain');
  const setClause = cols.map(k => `\`${k}\` = :${k}`).join(', ');
  updates.domain = domain;
  await execute(`UPDATE sites SET ${setClause} WHERE domain = :domain`, updates);

  return { scan_id };
}
