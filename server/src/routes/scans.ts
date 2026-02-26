import { Router, Request, Response } from 'express';
import { sqlite } from '../db';

const router = Router();

// GET /api/v1/scans/:domain - get scan history
router.get('/:domain', (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const history = sqlite.prepare(
    'SELECT * FROM scan_history WHERE domain = ? ORDER BY scanned_at DESC LIMIT 50'
  ).all(domain);
  res.json(history);
});

// POST /api/v1/scans - store scan result and auto-apply to sites table
router.post('/', (req: Request, res: Response) => {
  const { domain, scan_result, diff_summary } = req.body as {
    domain: string;
    scan_result: Record<string, unknown>;
    diff_summary?: Record<string, unknown>;
  };

  if (!domain || !scan_result) {
    res.status(400).json({ error: 'domain and scan_result are required' });
    return;
  }

  const existing = sqlite.prepare('SELECT domain FROM sites WHERE domain = ?').get(domain);
  if (!existing) {
    // Auto-create a minimal stub so newly-added domains can be scanned in
    // without requiring a prior GSA import. The scan result will fill the rest.
    sqlite.prepare(
      `INSERT OR IGNORE INTO sites (domain) VALUES (?)`
    ).run(domain);
  }

  const now = new Date().toISOString();

  // Store scan history
  const insertScan = sqlite.prepare(`
    INSERT INTO scan_history (domain, scanned_at, status, redirect_chain, sitemap_result, robots_result, tech_stack, dns_records, diff_summary, error_log, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const scanId = insertScan.run(
    domain,
    now,
    (scan_result.status as string) || 'completed',
    scan_result.redirect_chain ? JSON.stringify(scan_result.redirect_chain) : null,
    scan_result.sitemap ? JSON.stringify(scan_result.sitemap) : null,
    scan_result.robots ? JSON.stringify(scan_result.robots) : null,
    scan_result.tech_stack ? JSON.stringify(scan_result.tech_stack) : null,
    scan_result.dns ? JSON.stringify(scan_result.dns) : null,
    diff_summary ? JSON.stringify(diff_summary) : null,
    scan_result.errors ? JSON.stringify(scan_result.errors) : null,
    scan_result.duration_ms ?? null,
  ).lastInsertRowid;

  // Auto-apply tech data to sites table
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
      // WordPress REST API content enrichment
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
    // Generic technology detection
    if (ts.technologies?.length) updates.detected_technologies = JSON.stringify(ts.technologies);
    // Security headers
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
    // Enriched sitemap content analysis
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
    // Derive status_code from the final hop in the redirect chain
    if (Array.isArray(rc.hops) && rc.hops.length > 0) {
      updates.status_code = rc.hops[rc.hops.length - 1].status_code;
    }
  }

  // live is computed by the orchestrator from status code + login gate detection
  if ((scan_result as any).live !== undefined && (scan_result as any).live !== null) {
    updates.live = (scan_result as any).live ? 1 : 0;
  }

  if (scan_result.dns) {
    const d = scan_result.dns as any;
    if (d.ipv6 !== undefined) updates.ipv6 = d.ipv6 ? 1 : 0;
    if (d.a_records !== undefined) updates.dns_a_records = JSON.stringify(d.a_records);
    if (d.aaaa_records !== undefined) updates.dns_aaaa_records = JSON.stringify(d.aaaa_records);
    if (d.mx_records !== undefined) updates.dns_mx_records = JSON.stringify(d.mx_records);
    if (d.ns_records !== undefined) updates.dns_ns_records = JSON.stringify(d.ns_records);
    // hosting_provider from DNS is already merged into tech_stack by the orchestrator,
    // but fall back to applying it from dns directly if tech_stack was null
    if (d.hosting_provider != null && !updates.hosting_provider) {
      updates.hosting_provider = d.hosting_provider;
    }
  }

  updates.last_scan_id = scanId;

  const cols = Object.keys(updates).filter(k => k !== 'domain');
  const setClause = cols.map(k => `${k} = @${k}`).join(', ');
  updates.domain = domain;
  sqlite.prepare(`UPDATE sites SET ${setClause} WHERE domain = @domain`).run(updates);

  res.json({ scan_id: scanId, applied: true });
});

export default router;
