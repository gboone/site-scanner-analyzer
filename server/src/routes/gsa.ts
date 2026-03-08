import { Router, Request, Response } from 'express';
import { config } from '../config';
import { query, transaction, toPositional } from '../db';
import { sanitizeSingleLine, sanitizeMultiLine } from '../utils/sanitize';

const router = Router();
const GSA_BASE = 'https://api.gsa.gov/technology/site-scanning/v1';
const PAGE_SIZE = 100;

async function fetchOnePage(agency: string | undefined, page: number): Promise<any> {
  const { default: fetch } = await import('node-fetch');
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
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

/** Map a GSA API record to a DB row matching the sites table schema. */
function gsaToDbRow(s: any, now: string): Record<string, unknown> {
  return {
    domain: s.initial_domain ?? s.domain ?? null,
    name: s.name ?? null,
    url: s.url ?? null,
    base_domain: s.base_domain ?? null,
    initial_url: s.initial_url ?? null,
    initial_domain: s.initial_domain ?? null,
    initial_base_domain: s.initial_base_domain ?? null,
    initial_top_level_domain: s.initial_top_level_domain ?? null,
    top_level_domain: s.top_level_domain ?? null,
    redirect: boolInt(s.redirect),
    live: boolInt(s.live),
    status_code: s.status_code ?? null,
    media_type: s.media_type ?? null,
    page_hash: s.page_hash ?? null,
    scan_date: s.scan_date ?? null,
    test_404: boolInt((s as any)['404_test'] ?? s.test_404),
    agency: sanitizeSingleLine(s.agency),
    bureau: sanitizeSingleLine(s.bureau),
    branch: s.branch ?? null,
    primary_scan_status: s.primary_scan_status ?? null,
    accessibility_scan_status: s.accessibility_scan_status ?? null,
    dns_scan_status: s.dns_scan_status ?? null,
    not_found_scan_status: s.not_found_scan_status ?? null,
    performance_scan_status: s.performance_scan_status ?? null,
    robots_txt_scan_status: s.robots_txt_scan_status ?? null,
    security_scan_status: s.security_scan_status ?? null,
    sitemap_xml_scan_status: s.sitemap_xml_scan_status ?? null,
    www_scan_status: s.www_scan_status ?? null,
    pageviews: s.pageviews ?? null,
    dap: boolInt(s.dap),
    dap_parameters: jsonStr(s.dap_parameters),
    dap_version: s.dap_version ?? null,
    ga_tag_id: s.ga_tag_id ?? null,
    search_dot_gov: s.search_dot_gov ?? null,
    ipv6: boolInt(s.ipv6),
    hostname: s.hostname ?? null,
    cms: sanitizeSingleLine(s.cms),
    login_provider: sanitizeSingleLine(s.login_provider),
    site_search: boolInt(s.site_search),
    viewport_meta_tag: boolInt(s.viewport_meta_tag),
    main_element_present: boolInt(s.main_element_present),
    language: s.language ?? null,
    language_link: s.language_link ?? null,
    cumulative_layout_shift: s.cumulative_layout_shift ?? null,
    largest_contentful_paint: s.largest_contentful_paint ?? null,
    title: sanitizeSingleLine(s.title),
    description: sanitizeMultiLine(s.description),
    keywords: s.keywords ?? null,
    og_title: sanitizeSingleLine(s.og_title),
    og_description: sanitizeMultiLine(s.og_description),
    og_image: s.og_image ?? null,
    og_article_published: s.og_article_published ?? null,
    og_article_modified: s.og_article_modified ?? null,
    og_type: s.og_type ?? null,
    og_url: s.og_url ?? null,
    canonical_link: s.canonical_link ?? null,
    required_links_url: jsonStr(s.required_links_url),
    required_links_text: jsonStr(s.required_links_text),
    third_party_service_count: s.third_party_service_count ?? null,
    third_party_service_domains: jsonStr(s.third_party_service_domains),
    third_party_service_urls: jsonStr(s.third_party_service_urls),
    cookie_domains: jsonStr(s.cookie_domains),
    source_list: jsonStr(s.source_list),
    robots_txt_detected: boolInt(s.robots_txt_detected),
    robots_txt_url: (s as any).robots_txt_url ?? null,
    robots_txt_status_code: s.robots_txt_status_code ?? null,
    robots_txt_media_type: s.robots_txt_media_type ?? null,
    robots_txt_filesize: s.robots_txt_filesize ?? null,
    robots_txt_crawl_delay: s.robots_txt_crawl_delay ?? null,
    robots_txt_sitemap_locations: jsonStr(s.robots_txt_sitemap_locations),
    sitemap_xml_detected: boolInt(s.sitemap_xml_detected),
    sitemap_xml_url: (s as any).sitemap_xml_url ?? null,
    sitemap_xml_status_code: s.sitemap_xml_status_code ?? null,
    sitemap_xml_media_type: s.sitemap_xml_media_type ?? null,
    sitemap_xml_filesize: s.sitemap_xml_filesize ?? null,
    sitemap_xml_count: s.sitemap_xml_count ?? null,
    sitemap_xml_lastmod: s.sitemap_xml_lastmod ?? null,
    sitemap_xml_pdf_count: s.sitemap_xml_pdf_count ?? null,
    sitemap_xml_page_hash: s.sitemap_xml_page_hash ?? null,
    uswds_favicon: s.uswds_favicon ?? 0,
    uswds_favicon_in_css: s.uswds_favicon_in_css ?? 0,
    uswds_publicsans_font: s.uswds_publicsans_font ?? s.uswds_public_sans_font ?? 0,
    uswds_inpage_css: s.uswds_inpage_css ?? 0,
    uswds_string: s.uswds_string ?? 0,
    uswds_string_in_css: s.uswds_string_in_css ?? 0,
    uswds_version: s.uswds_version ?? 0,
    uswds_count: s.uswds_count ?? 0,
    uswds_usa_classes: s.uswds_usa_classes ?? 0,
    uswds_usa_class_list: jsonStr(s.uswds_usa_class_list),
    uswds_banner_heres_how: boolInt(s.uswds_banner_heres_how),
    uswds_semantic_version: s.uswds_semantic_version ?? null,
    https_enforced: boolInt(s.https_enforced),
    hsts: boolInt(s.hsts),
    www_url: s.www_url ?? null,
    www_status_code: s.www_status_code ?? null,
    www_title: s.www_title ?? null,
    imported_at: now,
    updated_at: now,
  };
}

// Matches the sites table schema exactly — same as routes/import.ts
const UPSERT_SQL = `
  INSERT INTO sites (
    domain, name, url, base_domain, initial_url, initial_domain, initial_base_domain,
    initial_top_level_domain, top_level_domain, redirect, live, status_code, media_type,
    page_hash, scan_date, test_404, agency, bureau, branch,
    primary_scan_status, accessibility_scan_status, dns_scan_status, not_found_scan_status,
    performance_scan_status, robots_txt_scan_status, security_scan_status,
    sitemap_xml_scan_status, www_scan_status,
    pageviews, dap, dap_parameters, dap_version, ga_tag_id, search_dot_gov,
    ipv6, hostname, cms, login_provider, site_search, viewport_meta_tag, main_element_present,
    language, language_link, cumulative_layout_shift, largest_contentful_paint,
    title, description, keywords, og_title, og_description, og_image,
    og_article_published, og_article_modified, og_type, og_url, canonical_link,
    required_links_url, required_links_text,
    third_party_service_count, third_party_service_domains, third_party_service_urls,
    cookie_domains, source_list,
    robots_txt_detected, robots_txt_url, robots_txt_status_code, robots_txt_media_type,
    robots_txt_filesize, robots_txt_crawl_delay, robots_txt_sitemap_locations,
    sitemap_xml_detected, sitemap_xml_url, sitemap_xml_status_code, sitemap_xml_media_type,
    sitemap_xml_filesize, sitemap_xml_count, sitemap_xml_lastmod, sitemap_xml_pdf_count,
    sitemap_xml_page_hash,
    uswds_favicon, uswds_favicon_in_css, uswds_publicsans_font, uswds_inpage_css,
    uswds_string, uswds_string_in_css, uswds_version, uswds_count, uswds_usa_classes,
    uswds_usa_class_list, uswds_banner_heres_how, uswds_semantic_version,
    https_enforced, hsts,
    www_url, www_status_code, www_title,
    imported_at, updated_at
  ) VALUES (
    :domain, :name, :url, :base_domain, :initial_url, :initial_domain, :initial_base_domain,
    :initial_top_level_domain, :top_level_domain, :redirect, :live, :status_code, :media_type,
    :page_hash, :scan_date, :test_404, :agency, :bureau, :branch,
    :primary_scan_status, :accessibility_scan_status, :dns_scan_status, :not_found_scan_status,
    :performance_scan_status, :robots_txt_scan_status, :security_scan_status,
    :sitemap_xml_scan_status, :www_scan_status,
    :pageviews, :dap, :dap_parameters, :dap_version, :ga_tag_id, :search_dot_gov,
    :ipv6, :hostname, :cms, :login_provider, :site_search, :viewport_meta_tag, :main_element_present,
    :language, :language_link, :cumulative_layout_shift, :largest_contentful_paint,
    :title, :description, :keywords, :og_title, :og_description, :og_image,
    :og_article_published, :og_article_modified, :og_type, :og_url, :canonical_link,
    :required_links_url, :required_links_text,
    :third_party_service_count, :third_party_service_domains, :third_party_service_urls,
    :cookie_domains, :source_list,
    :robots_txt_detected, :robots_txt_url, :robots_txt_status_code, :robots_txt_media_type,
    :robots_txt_filesize, :robots_txt_crawl_delay, :robots_txt_sitemap_locations,
    :sitemap_xml_detected, :sitemap_xml_url, :sitemap_xml_status_code, :sitemap_xml_media_type,
    :sitemap_xml_filesize, :sitemap_xml_count, :sitemap_xml_lastmod, :sitemap_xml_pdf_count,
    :sitemap_xml_page_hash,
    :uswds_favicon, :uswds_favicon_in_css, :uswds_publicsans_font, :uswds_inpage_css,
    :uswds_string, :uswds_string_in_css, :uswds_version, :uswds_count, :uswds_usa_classes,
    :uswds_usa_class_list, :uswds_banner_heres_how, :uswds_semantic_version,
    :https_enforced, :hsts,
    :www_url, :www_status_code, :www_title,
    :imported_at, :updated_at
  )
  ON DUPLICATE KEY UPDATE
    name                       = VALUES(name),
    url                        = VALUES(url),
    base_domain                = VALUES(base_domain),
    initial_url                = VALUES(initial_url),
    initial_domain             = VALUES(initial_domain),
    initial_base_domain        = VALUES(initial_base_domain),
    initial_top_level_domain   = VALUES(initial_top_level_domain),
    top_level_domain           = VALUES(top_level_domain),
    redirect                   = VALUES(redirect),
    live                       = VALUES(live),
    status_code                = VALUES(status_code),
    media_type                 = VALUES(media_type),
    page_hash                  = VALUES(page_hash),
    scan_date                  = VALUES(scan_date),
    test_404                   = VALUES(test_404),
    agency                     = VALUES(agency),
    bureau                     = VALUES(bureau),
    branch                     = VALUES(branch),
    primary_scan_status        = VALUES(primary_scan_status),
    accessibility_scan_status  = VALUES(accessibility_scan_status),
    dns_scan_status            = VALUES(dns_scan_status),
    not_found_scan_status      = VALUES(not_found_scan_status),
    performance_scan_status    = VALUES(performance_scan_status),
    robots_txt_scan_status     = VALUES(robots_txt_scan_status),
    security_scan_status       = VALUES(security_scan_status),
    sitemap_xml_scan_status    = VALUES(sitemap_xml_scan_status),
    www_scan_status            = VALUES(www_scan_status),
    pageviews                  = VALUES(pageviews),
    dap                        = VALUES(dap),
    dap_parameters             = VALUES(dap_parameters),
    dap_version                = VALUES(dap_version),
    ga_tag_id                  = VALUES(ga_tag_id),
    search_dot_gov             = VALUES(search_dot_gov),
    ipv6                       = VALUES(ipv6),
    hostname                   = VALUES(hostname),
    cms                        = VALUES(cms),
    login_provider             = VALUES(login_provider),
    site_search                = VALUES(site_search),
    viewport_meta_tag          = VALUES(viewport_meta_tag),
    main_element_present       = VALUES(main_element_present),
    language                   = VALUES(language),
    language_link              = VALUES(language_link),
    cumulative_layout_shift    = VALUES(cumulative_layout_shift),
    largest_contentful_paint   = VALUES(largest_contentful_paint),
    title                      = VALUES(title),
    description                = VALUES(description),
    keywords                   = VALUES(keywords),
    og_title                   = VALUES(og_title),
    og_description             = VALUES(og_description),
    og_image                   = VALUES(og_image),
    og_article_published       = VALUES(og_article_published),
    og_article_modified        = VALUES(og_article_modified),
    og_type                    = VALUES(og_type),
    og_url                     = VALUES(og_url),
    canonical_link             = VALUES(canonical_link),
    required_links_url         = VALUES(required_links_url),
    required_links_text        = VALUES(required_links_text),
    third_party_service_count  = VALUES(third_party_service_count),
    third_party_service_domains = VALUES(third_party_service_domains),
    third_party_service_urls   = VALUES(third_party_service_urls),
    cookie_domains             = VALUES(cookie_domains),
    source_list                = VALUES(source_list),
    robots_txt_detected        = VALUES(robots_txt_detected),
    robots_txt_url             = VALUES(robots_txt_url),
    robots_txt_status_code     = VALUES(robots_txt_status_code),
    robots_txt_media_type      = VALUES(robots_txt_media_type),
    robots_txt_filesize        = VALUES(robots_txt_filesize),
    robots_txt_crawl_delay     = VALUES(robots_txt_crawl_delay),
    robots_txt_sitemap_locations = VALUES(robots_txt_sitemap_locations),
    sitemap_xml_detected       = VALUES(sitemap_xml_detected),
    sitemap_xml_url            = VALUES(sitemap_xml_url),
    sitemap_xml_status_code    = VALUES(sitemap_xml_status_code),
    sitemap_xml_media_type     = VALUES(sitemap_xml_media_type),
    sitemap_xml_filesize       = VALUES(sitemap_xml_filesize),
    sitemap_xml_count          = VALUES(sitemap_xml_count),
    sitemap_xml_lastmod        = VALUES(sitemap_xml_lastmod),
    sitemap_xml_pdf_count      = VALUES(sitemap_xml_pdf_count),
    sitemap_xml_page_hash      = VALUES(sitemap_xml_page_hash),
    uswds_favicon              = VALUES(uswds_favicon),
    uswds_favicon_in_css       = VALUES(uswds_favicon_in_css),
    uswds_publicsans_font      = VALUES(uswds_publicsans_font),
    uswds_inpage_css           = VALUES(uswds_inpage_css),
    uswds_string               = VALUES(uswds_string),
    uswds_string_in_css        = VALUES(uswds_string_in_css),
    uswds_version              = VALUES(uswds_version),
    uswds_count                = VALUES(uswds_count),
    uswds_usa_classes          = VALUES(uswds_usa_classes),
    uswds_usa_class_list       = VALUES(uswds_usa_class_list),
    uswds_banner_heres_how     = VALUES(uswds_banner_heres_how),
    uswds_semantic_version     = VALUES(uswds_semantic_version),
    https_enforced             = VALUES(https_enforced),
    hsts                       = VALUES(hsts),
    www_url                    = VALUES(www_url),
    www_status_code            = VALUES(www_status_code),
    www_title                  = VALUES(www_title),
    imported_at                = VALUES(imported_at),
    updated_at                 = VALUES(updated_at)
`;

/**
 * POST /api/v1/gsa/import
 *
 * Streams an ndjson response so VIP's proxy doesn't time out during the
 * multi-minute import.  Each line is a JSON object:
 *   { type: 'start',    totalPages, totalCount }
 *   { type: 'progress', page, totalPages, inserted, updated }
 *   { type: 'complete', inserted, updated, total_sites, pages_fetched, error_count, errors }
 *   { type: 'error',    error }
 */
router.post('/import', async (req: Request, res: Response) => {
  if (!config.gsaApiKey) {
    res.status(400).json({ error: 'GSA_API_KEY not configured. Add it in Settings.' });
    return;
  }

  const agency: string | undefined = req.body?.agency?.trim() || undefined;

  // Send headers immediately — this prevents nginx/VIP from closing the
  // connection while the long-running import is in progress.
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('X-Accel-Buffering', 'no'); // tell nginx not to buffer
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const send = (data: object) => res.write(JSON.stringify(data) + '\n');

  try {
    const firstPage = await fetchOnePage(agency, 1);
    const meta = firstPage.meta ?? firstPage;
    const totalCount: number = meta.totalItems ?? firstPage.count ?? firstPage.total ?? (firstPage.items?.length ?? 0);
    const totalPages: number = meta.totalPages ?? Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    send({ type: 'start', totalPages, totalCount });

    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    // Load existing domains once so we can track inserted vs updated counts.
    const existingRows = await query<{ domain: string }>('SELECT domain FROM sites');
    const existingDomains = new Set(existingRows.map(r => r.domain));

    /** Validate, map, and upsert a slice of raw GSA items into the DB. */
    const processItems = async (items: any[]) => {
      const valid: { row: Record<string, unknown>; isNew: boolean }[] = [];
      for (const s of items) {
        const domain = s.initial_domain ?? s.domain ?? null;
        if (!domain) {
          errors.push(`skipped: missing domain (initial_url=${s.initial_url ?? 'unknown'})`);
          continue;
        }
        valid.push({ row: gsaToDbRow(s, now), isNew: !existingDomains.has(domain) });
        existingDomains.add(domain); // deduplicate within the same payload
      }

      const BATCH_SIZE = 100;
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = valid.slice(i, i + BATCH_SIZE);
        try {
          await transaction(async (client) => {
            for (const { row } of batch) {
              const [s, a] = toPositional(UPSERT_SQL, row);
              await client.query(s, a);
            }
          });
          for (const { isNew } of batch) {
            if (isNew) inserted++; else updated++;
          }
        } catch (e: any) {
          errors.push(`Batch error (rows ${i}–${i + batch.length - 1}): ${e.message}`);
        }
      }
    };

    // Process first page
    await processItems(firstPage.items ?? firstPage.results ?? []);
    send({ type: 'progress', page: 1, totalPages, inserted, updated });

    // Fetch and process remaining pages in parallel batches of 5,
    // writing to the DB and streaming progress after each batch so the
    // connection stays alive and memory stays bounded.
    for (let start = 2; start <= totalPages; start += 5) {
      const end = Math.min(start + 4, totalPages);
      const pages = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, i) => fetchOnePage(agency, start + i))
      );
      const items = pages.flatMap(p => p.items ?? p.results ?? []);
      await processItems(items);
      send({ type: 'progress', page: end, totalPages, inserted, updated });
    }

    res.end(
      JSON.stringify({
        type: 'complete',
        inserted,
        updated,
        total_sites: inserted + updated,
        pages_fetched: totalPages,
        error_count: errors.length,
        errors: errors.slice(0, 20),
      }) + '\n'
    );
  } catch (err: any) {
    res.end(JSON.stringify({ type: 'error', error: err.message }) + '\n');
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
