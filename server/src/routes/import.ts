import { Router, Request, Response } from 'express';
import { query, transaction, toPositional } from '../db';
import type { SiteRecord, ImportResult } from 'shared';
import { sanitizeSingleLine, sanitizeMultiLine } from '../utils/sanitize';

const router = Router();

function toDbRow(site: SiteRecord): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    domain: site.domain,
    name: site.name ?? null,
    url: site.url ?? null,
    base_domain: site.base_domain ?? null,
    initial_url: site.initial_url ?? null,
    initial_domain: site.initial_domain ?? null,
    initial_base_domain: site.initial_base_domain ?? null,
    initial_top_level_domain: site.initial_top_level_domain ?? null,
    top_level_domain: site.top_level_domain ?? null,
    redirect: site.redirect ? 1 : 0,
    live: site.live ? 1 : 0,
    status_code: site.status_code ?? null,
    media_type: site.media_type ?? null,
    page_hash: site.page_hash ?? null,
    scan_date: site.scan_date ?? null,
    test_404: (site as any)['404_test'] ? 1 : 0,
    agency: sanitizeSingleLine(site.agency),
    bureau: sanitizeSingleLine(site.bureau),
    branch: site.branch ?? null,
    primary_scan_status: site.primary_scan_status ?? null,
    accessibility_scan_status: site.accessibility_scan_status ?? null,
    dns_scan_status: site.dns_scan_status ?? null,
    not_found_scan_status: site.not_found_scan_status ?? null,
    performance_scan_status: site.performance_scan_status ?? null,
    robots_txt_scan_status: site.robots_txt_scan_status ?? null,
    security_scan_status: site.security_scan_status ?? null,
    sitemap_xml_scan_status: site.sitemap_xml_scan_status ?? null,
    www_scan_status: site.www_scan_status ?? null,
    pageviews: site.pageviews ?? null,
    dap: site.dap ? 1 : 0,
    dap_parameters: site.dap_parameters ? JSON.stringify(site.dap_parameters) : null,
    dap_version: site.dap_version ?? null,
    ga_tag_id: site.ga_tag_id ?? null,
    search_dot_gov: site.search_dot_gov ?? null,
    ipv6: site.ipv6 ? 1 : 0,
    hostname: site.hostname ?? null,
    cms: sanitizeSingleLine(site.cms),
    login_provider: sanitizeSingleLine(site.login_provider),
    site_search: site.site_search ? 1 : 0,
    viewport_meta_tag: site.viewport_meta_tag ? 1 : 0,
    main_element_present: site.main_element_present ? 1 : 0,
    language: site.language ?? null,
    language_link: site.language_link ?? null,
    cumulative_layout_shift: site.cumulative_layout_shift ?? null,
    largest_contentful_paint: site.largest_contentful_paint ?? null,
    title: sanitizeSingleLine(site.title),
    description: sanitizeMultiLine(site.description),
    keywords: site.keywords ?? null,
    og_title: sanitizeSingleLine(site.og_title),
    og_description: sanitizeMultiLine(site.og_description),
    og_image: site.og_image ?? null,
    og_article_published: site.og_article_published ?? null,
    og_article_modified: site.og_article_modified ?? null,
    og_type: site.og_type ?? null,
    og_url: site.og_url ?? null,
    canonical_link: site.canonical_link ?? null,
    required_links_url: site.required_links_url ? JSON.stringify(site.required_links_url) : null,
    required_links_text: site.required_links_text ? JSON.stringify(site.required_links_text) : null,
    third_party_service_count: site.third_party_service_count ?? null,
    third_party_service_domains: site.third_party_service_domains ? JSON.stringify(site.third_party_service_domains) : null,
    third_party_service_urls: site.third_party_service_urls ? JSON.stringify(site.third_party_service_urls) : null,
    cookie_domains: site.cookie_domains ? JSON.stringify(site.cookie_domains) : null,
    source_list: site.source_list ? JSON.stringify(site.source_list) : null,
    robots_txt_detected: site.robots_txt_detected ? 1 : 0,
    robots_txt_url: (site as any).robots_txt_url ?? null,
    robots_txt_status_code: site.robots_txt_status_code ?? null,
    robots_txt_media_type: site.robots_txt_media_type ?? null,
    robots_txt_filesize: site.robots_txt_filesize ?? null,
    robots_txt_crawl_delay: site.robots_txt_crawl_delay ?? null,
    robots_txt_sitemap_locations: site.robots_txt_sitemap_locations ? JSON.stringify(site.robots_txt_sitemap_locations) : null,
    sitemap_xml_detected: site.sitemap_xml_detected ? 1 : 0,
    sitemap_xml_url: (site as any).sitemap_xml_url ?? null,
    sitemap_xml_status_code: site.sitemap_xml_status_code ?? null,
    sitemap_xml_media_type: site.sitemap_xml_media_type ?? null,
    sitemap_xml_filesize: site.sitemap_xml_filesize ?? null,
    sitemap_xml_count: site.sitemap_xml_count ?? null,
    sitemap_xml_lastmod: site.sitemap_xml_lastmod ?? null,
    sitemap_xml_pdf_count: site.sitemap_xml_pdf_count ?? null,
    sitemap_xml_page_hash: site.sitemap_xml_page_hash ?? null,
    uswds_favicon: site.uswds_favicon ?? 0,
    uswds_favicon_in_css: site.uswds_favicon_in_css ?? 0,
    uswds_publicsans_font: site.uswds_publicsans_font ?? 0,
    uswds_inpage_css: site.uswds_inpage_css ?? 0,
    uswds_string: site.uswds_string ?? 0,
    uswds_string_in_css: site.uswds_string_in_css ?? 0,
    uswds_version: site.uswds_version ?? 0,
    uswds_count: site.uswds_count ?? 0,
    uswds_usa_classes: site.uswds_usa_classes ?? 0,
    uswds_usa_class_list: site.uswds_usa_class_list ? JSON.stringify(site.uswds_usa_class_list) : null,
    uswds_banner_heres_how: site.uswds_banner_heres_how ? 1 : 0,
    uswds_semantic_version: site.uswds_semantic_version ?? null,
    https_enforced: site.https_enforced ? 1 : 0,
    hsts: site.hsts ? 1 : 0,
    www_url: site.www_url ?? null,
    www_status_code: site.www_status_code ?? null,
    www_title: site.www_title ?? null,
    imported_at: now,
    updated_at: now,
  };
}

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

router.post('/', async (req: Request, res: Response) => {
  const sites: SiteRecord[] = req.body;

  if (!Array.isArray(sites)) {
    res.status(400).json({ error: 'Body must be a JSON array of site records' });
    return;
  }

  const result: ImportResult = { inserted: 0, updated: 0, errors: [] };

  // Fetch existing domains once so we can report inserted vs updated counts
  const existingRows = await query<{ domain: string }>('SELECT domain FROM sites');
  const existingDomains = new Set(existingRows.map(r => r.domain));

  // Validate and pre-process all rows before entering any transactions.
  // Filtering invalid rows here keeps each batch transaction clean.
  const validSites: { row: Record<string, unknown>; isNew: boolean }[] = [];
  for (const site of sites) {
    if (!site.domain) {
      result.errors.push(`Skipping record with no domain: ${JSON.stringify(site).slice(0, 100)}`);
      continue;
    }
    validSites.push({ row: toDbRow(site), isNew: !existingDomains.has(site.domain) });
    existingDomains.add(site.domain); // track dupes within the same payload
  }

  const total = validSites.length;
  const startTime = Date.now();
  console.log(`[import] started — ${total} valid records (${result.errors.length} skipped), batch size 100`);

  // Process in batches of 100 — each batch is one atomic transaction
  const BATCH_SIZE = 100;
  for (let i = 0; i < validSites.length; i += BATCH_SIZE) {
    const batch = validSites.slice(i, i + BATCH_SIZE);
    try {
      await transaction(async (client) => {
        for (const { row } of batch) {
          const [s, a] = toPositional(UPSERT_SQL, row);
          await client.query(s, a);
        }
      });
      for (const { isNew } of batch) {
        if (isNew) result.inserted++;
        else result.updated++;
      }
    } catch (err: any) {
      result.errors.push(`Batch error (rows ${i}–${i + batch.length - 1}): ${err.message}`);
    }

    // Log progress every 1,000 records so VIP logs show the import is still running
    const processed = Math.min(i + BATCH_SIZE, total);
    if (processed % 1000 === 0 || processed === total) {
      const pct = Math.round((processed / total) * 100);
      console.log(`[import] ${processed}/${total} (${pct}%) — inserted: ${result.inserted}, updated: ${result.updated}, errors: ${result.errors.length}`);
    }
  }

  const duration_ms = Date.now() - startTime;
  console.log(`[import] complete in ${(duration_ms / 1000).toFixed(1)}s — inserted: ${result.inserted}, updated: ${result.updated}, errors: ${result.errors.length}`);

  res.json(result);
});

export default router;
