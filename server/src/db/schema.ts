import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const sites = sqliteTable('sites', {
  // Core identification
  domain: text('domain').primaryKey(),
  name: text('name'),
  url: text('url'),
  base_domain: text('base_domain'),
  initial_url: text('initial_url'),
  initial_domain: text('initial_domain'),
  initial_base_domain: text('initial_base_domain'),
  initial_top_level_domain: text('initial_top_level_domain'),
  top_level_domain: text('top_level_domain'),

  // Status
  redirect: integer('redirect', { mode: 'boolean' }),
  live: integer('live', { mode: 'boolean' }),
  status_code: integer('status_code'),
  media_type: text('media_type'),
  page_hash: text('page_hash'),
  scan_date: text('scan_date'),
  test_404: integer('test_404', { mode: 'boolean' }),

  // Organization
  agency: text('agency'),
  bureau: text('bureau'),
  branch: text('branch'),

  // Scan statuses
  primary_scan_status: text('primary_scan_status'),
  accessibility_scan_status: text('accessibility_scan_status'),
  dns_scan_status: text('dns_scan_status'),
  not_found_scan_status: text('not_found_scan_status'),
  performance_scan_status: text('performance_scan_status'),
  robots_txt_scan_status: text('robots_txt_scan_status'),
  security_scan_status: text('security_scan_status'),
  sitemap_xml_scan_status: text('sitemap_xml_scan_status'),
  www_scan_status: text('www_scan_status'),

  // Analytics
  pageviews: integer('pageviews'),
  dap: integer('dap', { mode: 'boolean' }),
  dap_parameters: text('dap_parameters'), // JSON
  dap_version: text('dap_version'),
  ga_tag_id: text('ga_tag_id'),
  search_dot_gov: text('search_dot_gov'),

  // Technical
  ipv6: integer('ipv6', { mode: 'boolean' }),
  hostname: text('hostname'),
  cms: text('cms'),
  login_provider: text('login_provider'),
  site_search: integer('site_search', { mode: 'boolean' }),
  viewport_meta_tag: integer('viewport_meta_tag', { mode: 'boolean' }),
  main_element_present: integer('main_element_present', { mode: 'boolean' }),
  language: text('language'),
  language_link: text('language_link'),
  cumulative_layout_shift: text('cumulative_layout_shift'),
  largest_contentful_paint: text('largest_contentful_paint'),

  // Metadata / SEO
  title: text('title'),
  description: text('description'),
  keywords: text('keywords'),
  og_title: text('og_title'),
  og_description: text('og_description'),
  og_image: text('og_image'),
  og_article_published: text('og_article_published'),
  og_article_modified: text('og_article_modified'),
  og_type: text('og_type'),
  og_url: text('og_url'),
  canonical_link: text('canonical_link'),
  required_links_url: text('required_links_url'),   // JSON array
  required_links_text: text('required_links_text'),  // JSON array

  // Third-party services
  third_party_service_count: integer('third_party_service_count'),
  third_party_service_domains: text('third_party_service_domains'), // JSON array
  third_party_service_urls: text('third_party_service_urls'),       // JSON array
  cookie_domains: text('cookie_domains'),                            // JSON array
  source_list: text('source_list'),                                  // JSON array

  // Robots.txt
  robots_txt_detected: integer('robots_txt_detected', { mode: 'boolean' }),
  robots_txt_url: text('robots_txt_url'),
  robots_txt_status_code: integer('robots_txt_status_code'),
  robots_txt_media_type: text('robots_txt_media_type'),
  robots_txt_filesize: integer('robots_txt_filesize'),
  robots_txt_crawl_delay: real('robots_txt_crawl_delay'),
  robots_txt_sitemap_locations: text('robots_txt_sitemap_locations'), // JSON array

  // Sitemap
  sitemap_xml_detected: integer('sitemap_xml_detected', { mode: 'boolean' }),
  sitemap_xml_url: text('sitemap_xml_url'),
  sitemap_xml_status_code: integer('sitemap_xml_status_code'),
  sitemap_xml_media_type: text('sitemap_xml_media_type'),
  sitemap_xml_filesize: integer('sitemap_xml_filesize'),
  sitemap_xml_count: integer('sitemap_xml_count'),
  sitemap_xml_lastmod: text('sitemap_xml_lastmod'),
  sitemap_xml_pdf_count: integer('sitemap_xml_pdf_count'),
  sitemap_xml_page_hash: text('sitemap_xml_page_hash'),

  // USWDS (11 fields)
  uswds_favicon: integer('uswds_favicon'),
  uswds_favicon_in_css: integer('uswds_favicon_in_css'),
  uswds_publicsans_font: integer('uswds_publicsans_font'),
  uswds_inpage_css: integer('uswds_inpage_css'),
  uswds_string: integer('uswds_string'),
  uswds_string_in_css: integer('uswds_string_in_css'),
  uswds_version: integer('uswds_version'),
  uswds_count: integer('uswds_count'),
  uswds_usa_classes: integer('uswds_usa_classes'),
  uswds_usa_class_list: text('uswds_usa_class_list'), // JSON array
  uswds_banner_heres_how: integer('uswds_banner_heres_how', { mode: 'boolean' }),
  uswds_semantic_version: text('uswds_semantic_version'),

  // Security
  https_enforced: integer('https_enforced', { mode: 'boolean' }),
  hsts: integer('hsts', { mode: 'boolean' }),

  // WWW check
  www_url: text('www_url'),
  www_status_code: integer('www_status_code'),
  www_title: text('www_title'),

  // Local tracking
  imported_at: text('imported_at').notNull().default(sql`(datetime('now'))`),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  agencyIdx: index('idx_sites_agency').on(table.agency),
  bureauIdx: index('idx_sites_bureau').on(table.bureau),
  liveIdx: index('idx_sites_live').on(table.live),
  uswdsIdx: index('idx_sites_uswds').on(table.uswds_count),
  dapIdx: index('idx_sites_dap').on(table.dap),
  sitemapIdx: index('idx_sites_sitemap').on(table.sitemap_xml_detected),
}));

export const scan_history = sqliteTable('scan_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  domain: text('domain').notNull().references(() => sites.domain, { onDelete: 'cascade' }),
  scanned_at: text('scanned_at').notNull(),
  status: text('status').notNull(), // 'completed' | 'failed' | 'partial'
  redirect_chain: text('redirect_chain'),  // JSON
  sitemap_result: text('sitemap_result'),  // JSON
  robots_result: text('robots_result'),    // JSON
  tech_stack: text('tech_stack'),          // JSON
  dns_records: text('dns_records'),        // JSON
  diff_summary: text('diff_summary'),      // JSON
  error_log: text('error_log'),            // JSON array
  duration_ms: integer('duration_ms'),
}, (table) => ({
  domainIdx: index('idx_scan_history_domain').on(table.domain),
  scannedAtIdx: index('idx_scan_history_scanned_at').on(table.scanned_at),
}));

export const briefings = sqliteTable('briefings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  domain: text('domain').notNull().references(() => sites.domain, { onDelete: 'cascade' }),
  created_at: text('created_at').notNull(),
  provider: text('provider').notNull(), // 'glean' | 'claude'
  model: text('model'),
  agency_identity: text('agency_identity'),
  website_purpose: text('website_purpose'),
  policy_objectives: text('policy_objectives'),
  recent_milestones: text('recent_milestones'),
  website_role: text('website_role'),
  references_json: text('references_json'), // JSON array of BriefingReference
  full_markdown: text('full_markdown'),
  prompt_tokens: integer('prompt_tokens'),
  completion_tokens: integer('completion_tokens'),
  duration_ms: integer('duration_ms'),
}, (table) => ({
  domainIdx: index('idx_briefings_domain').on(table.domain),
}));

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
