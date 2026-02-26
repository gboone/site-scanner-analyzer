import { Router, Request, Response } from 'express';
import { config } from '../config';
import { sqlite } from '../db';

const router = Router();
const GSA_BASE = 'https://api.gsa.gov/technology/site-scanning/v1';
const PAGE_SIZE = 100;

async function fetchOnePage(agency: string | undefined, page: number): Promise<any> {
  const { default: fetch } = await import('node-fetch');
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
  // API v2 uses 'agency' as the filter param (was 'target_url_agency_owner' in v1)
  if (agency) params.set('agency', agency);
  const response = await fetch(`${GSA_BASE}/websites?${params}`, {
    headers: { 'X-Api-Key': config.gsaApiKey, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSA API ${response.status}: ${text}`);
  }
  return response.json();
}

const boolInt = (v: any) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : null);
const jsonStr = (v: any) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));

/**
 * POST /api/v1/gsa/import
 * Fetches all pages from the GSA API (optionally filtered by agency) and
 * upserts every record into the local SQLite DB in one transaction.
 * Body: { agency?: string }
 * Returns: { inserted, updated, total_sites, pages_fetched, errors }
 */
router.post('/import', async (req: Request, res: Response) => {
  if (!config.gsaApiKey) {
    res.status(400).json({ error: 'GSA_API_KEY not configured. Add it in Settings.' });
    return;
  }

  const agency: string | undefined = req.body?.agency?.trim() || undefined;

  try {
    // First page tells us the total count and page count.
    // Current API wraps pagination info in a 'meta' object:
    //   { items: [...], meta: { totalItems, totalPages, ... }, links: {...} }
    const firstPage = await fetchOnePage(agency, 1);
    const meta = firstPage.meta ?? firstPage;
    const totalCount: number = meta.totalItems ?? firstPage.count ?? firstPage.total ?? (firstPage.items?.length ?? 0);
    const totalPages: number = meta.totalPages ?? Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    // Fetch remaining pages in parallel batches of 5
    const allSites: any[] = [...(firstPage.items ?? firstPage.results ?? [])];
    for (let start = 2; start <= totalPages; start += 5) {
      const end = Math.min(start + 4, totalPages);
      const pages = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, i) => fetchOnePage(agency, start + i))
      );
      for (const p of pages) allSites.push(...(p.items ?? p.results ?? []));
    }

    // Upsert into SQLite
    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    // Prepare both statements BEFORE the transaction — calling sqlite.prepare()
    // inside a sqlite.transaction() callback throws in better-sqlite3 v11+.
    const checkExists = sqlite.prepare('SELECT 1 FROM sites WHERE domain = ?');

    const upsert = sqlite.prepare(`
      INSERT INTO sites (
        domain, url, agency, bureau, branch, live, redirect, https, http_status_code,
        final_url, status_code, redirect_to, content_type, cms,
        uswds_count, uswds_usa_classes, uswds_favicon, uswds_banner_heres_how,
        uswds_string, uswds_string_in_css, uswds_merriweather_font, uswds_public_sans_font,
        uswds_source_sans_font, uswds_semantic_version, uswds_version,
        dap, dap_parameters, ga, ga_tag_id, pageviews,
        sitemap_xml_detected, sitemap_xml_status_code, sitemap_xml_count, sitemap_xml_pdf_count,
        sitemap_xml_filesize, sitemap_xml_lastmod, sitemap_xml_detected_by_robotstxt,
        robots_txt_detected, robots_txt_status_code, robots_txt_filesize, robots_txt_crawl_delay,
        robots_txt_sitemap_locations, has_login, login_provider,
        https_enforced, hsts, hsts_preloaded, ipv6, dnssec,
        third_party_service_domains, third_party_service_count,
        canonical_link, title, description, og_title, og_description,
        og_article_published, og_article_modified, language, script_tags,
        analytics_detected, analytics_platforms, source_code_url, site_search_detected,
        contact_email_address, contact_form_detected, main_element_present,
        accessibility_statement_detected, doge_url, scan_date, imported_at, updated_at
      ) VALUES (
        @domain, @url, @agency, @bureau, @branch, @live, @redirect, @https, @http_status_code,
        @final_url, @status_code, @redirect_to, @content_type, @cms,
        @uswds_count, @uswds_usa_classes, @uswds_favicon, @uswds_banner_heres_how,
        @uswds_string, @uswds_string_in_css, @uswds_merriweather_font, @uswds_public_sans_font,
        @uswds_source_sans_font, @uswds_semantic_version, @uswds_version,
        @dap, @dap_parameters, @ga, @ga_tag_id, @pageviews,
        @sitemap_xml_detected, @sitemap_xml_status_code, @sitemap_xml_count, @sitemap_xml_pdf_count,
        @sitemap_xml_filesize, @sitemap_xml_lastmod, @sitemap_xml_detected_by_robotstxt,
        @robots_txt_detected, @robots_txt_status_code, @robots_txt_filesize, @robots_txt_crawl_delay,
        @robots_txt_sitemap_locations, @has_login, @login_provider,
        @https_enforced, @hsts, @hsts_preloaded, @ipv6, @dnssec,
        @third_party_service_domains, @third_party_service_count,
        @canonical_link, @title, @description, @og_title, @og_description,
        @og_article_published, @og_article_modified, @language, @script_tags,
        @analytics_detected, @analytics_platforms, @source_code_url, @site_search_detected,
        @contact_email_address, @contact_form_detected, @main_element_present,
        @accessibility_statement_detected, @doge_url, @scan_date, @imported_at, @updated_at
      )
      ON CONFLICT(domain) DO UPDATE SET
        url=excluded.url, agency=excluded.agency, bureau=excluded.bureau, live=excluded.live,
        status_code=excluded.status_code, uswds_count=excluded.uswds_count, dap=excluded.dap,
        sitemap_xml_detected=excluded.sitemap_xml_detected, https_enforced=excluded.https_enforced,
        scan_date=excluded.scan_date, updated_at=excluded.updated_at
    `);

    sqlite.transaction((sites: any[]) => {
      for (const s of sites) {
        // Current API uses 'initial_domain' as the primary domain identifier.
        // 'domain' is the final/resolved domain (may differ if redirect occurred).
        const domain = s.initial_domain ?? s.domain ?? null;
        if (!domain) {
          errors.push(`skipped: item missing domain (initial_url=${s.initial_url ?? 'unknown'})`);
          continue;
        }
        try {
          const exists = checkExists.get(domain);
          upsert.run({
            // Core identifiers
            domain,
            url: s.initial_url ?? s.url ?? null,
            agency: s.agency ?? null,
            bureau: s.bureau ?? null,
            branch: s.branch ?? null,
            // Live / redirect
            live: boolInt(s.live),
            redirect: boolInt(s.redirect),
            // HTTPS — derive from final url (now called 'url')
            https: s.url
              ? (s.url.startsWith('https://') ? 1 : 0)
              : null,
            http_status_code: s.status_code ?? null,
            final_url: s.url ?? null,
            status_code: s.status_code ?? null,
            redirect_to: s.redirect ? (s.url ?? null) : null,
            content_type: s.media_type ?? null,
            cms: s.cms ?? null,
            // USWDS — 'publicsans' spelling in current API
            uswds_count: s.uswds_count ?? null,
            uswds_usa_classes: s.uswds_usa_classes ?? null,
            uswds_favicon: boolInt(s.uswds_favicon),
            uswds_banner_heres_how: boolInt(s.uswds_banner_heres_how),
            uswds_string: s.uswds_string ?? null,
            uswds_string_in_css: s.uswds_string_in_css ?? null,
            uswds_merriweather_font: s.uswds_merriweather_font ?? null,
            uswds_public_sans_font: s.uswds_publicsans_font ?? s.uswds_public_sans_font ?? null,
            uswds_source_sans_font: s.uswds_source_sans_font ?? null,
            uswds_semantic_version: s.uswds_semantic_version ?? null,
            uswds_version: s.uswds_version ?? null,
            // DAP — no longer has _final_url suffix
            dap: boolInt(s.dap),
            dap_parameters: jsonStr(s.dap_parameters),
            ga: null,
            ga_tag_id: s.ga_tag_id ?? null,
            pageviews: s.pageviews ?? null,
            // Sitemap — field names unchanged
            sitemap_xml_detected: boolInt(s.sitemap_xml_detected),
            sitemap_xml_status_code: s.sitemap_xml_status_code ?? null,
            sitemap_xml_count: s.sitemap_xml_count ?? null,
            sitemap_xml_pdf_count: s.sitemap_xml_pdf_count ?? null,
            sitemap_xml_filesize: s.sitemap_xml_filesize ?? null,
            sitemap_xml_lastmod: s.sitemap_xml_lastmod ?? null,
            sitemap_xml_detected_by_robotstxt: boolInt(s.sitemap_xml_detected_by_robotstxt),
            // Robots — field names unchanged
            robots_txt_detected: boolInt(s.robots_txt_detected),
            robots_txt_status_code: s.robots_txt_status_code ?? null,
            robots_txt_filesize: s.robots_txt_filesize ?? null,
            robots_txt_crawl_delay: s.robots_txt_crawl_delay ?? null,
            robots_txt_sitemap_locations: jsonStr(s.robots_txt_sitemap_locations),
            // Login / security — 'login' replaces 'login_detected'
            has_login: boolInt(s.login),
            login_provider: s.login_provider ?? null,
            https_enforced: boolInt(s.https_enforced),
            hsts: boolInt(s.hsts),
            hsts_preloaded: null,       // dropped from current API
            ipv6: boolInt(s.ipv6),
            dnssec: null,               // dropped from current API
            // Third-party
            third_party_service_domains: jsonStr(s.third_party_service_domains),
            third_party_service_count: s.third_party_service_count ?? null,
            // Content metadata — no more _final_url suffix on OG fields
            canonical_link: s.canonical_link ?? null,
            title: s.title ?? null,
            description: s.description ?? null,
            og_title: s.og_title ?? null,
            og_description: s.og_description ?? null,
            og_article_published: s.og_article_published ?? null,
            og_article_modified: s.og_article_modified ?? null,
            language: s.language ?? null,
            script_tags: null,
            analytics_detected: null,
            analytics_platforms: null,
            source_code_url: s.source_code_url ?? null,
            site_search_detected: boolInt(s.site_search),
            contact_email_address: s.contact_email_address ?? null,
            contact_form_detected: boolInt(s.contact_form_detected),
            main_element_present: boolInt(s.main_element_present),
            accessibility_statement_detected: boolInt(s.accessibility_statement_detected),
            doge_url: null,
            scan_date: s.scan_date ?? null,
            imported_at: now,
            updated_at: now,
          });
          if (exists) updated++; else inserted++;
        } catch (e: any) {
          errors.push(`${domain}: ${e.message}`);
        }
      }
    })(allSites);

    res.json({ inserted, updated, total_sites: allSites.length, pages_fetched: totalPages, error_count: errors.length, errors: errors.slice(0, 20) });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

/** GET /fetch — single-page pass-through (kept for debugging) */
router.get('/fetch', async (req: Request, res: Response) => {
  const { agency, page = '1' } = req.query as Record<string, string>;
  if (!config.gsaApiKey) {
    res.status(400).json({ error: 'GSA_API_KEY not configured. Add it to Settings.' });
    return;
  }
  try {
    const data = await fetchOnePage(agency, parseInt(page));
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/test', async (_req: Request, res: Response) => {
  if (!config.gsaApiKey) {
    res.json({ connected: false, reason: 'No API key configured' });
    return;
  }
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(`${GSA_BASE}/websites?limit=1`, {
      headers: { 'X-Api-Key': config.gsaApiKey },
      signal: AbortSignal.timeout(10000),
    });
    res.json({ connected: response.ok, status: response.status });
  } catch (err: any) {
    res.json({ connected: false, reason: err.message });
  }
});

export default router;
