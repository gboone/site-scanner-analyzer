import { mysqlTable, varchar, text, int, double, index } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

const TS_DEFAULT = sql`(DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%SZ'))`;

export const sites = mysqlTable('sites', {
  // Core identification
  domain: varchar('domain', { length: 255 }).primaryKey(),
  name: text('name'),
  url: text('url'),
  base_domain: text('base_domain'),
  initial_url: text('initial_url'),
  initial_domain: text('initial_domain'),
  initial_base_domain: text('initial_base_domain'),
  initial_top_level_domain: text('initial_top_level_domain'),
  top_level_domain: text('top_level_domain'),

  // Status
  redirect: int('redirect'),
  live: int('live'),
  status_code: int('status_code'),
  media_type: text('media_type'),
  page_hash: text('page_hash'),
  scan_date: text('scan_date'),
  test_404: int('test_404'),

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
  pageviews: int('pageviews'),
  dap: int('dap'),
  dap_parameters: text('dap_parameters'), // JSON
  dap_version: text('dap_version'),
  ga_tag_id: text('ga_tag_id'),
  search_dot_gov: text('search_dot_gov'),

  // Technical
  ipv6: int('ipv6'),
  hostname: text('hostname'),
  cms: text('cms'),
  login_provider: text('login_provider'),
  site_search: int('site_search'),
  viewport_meta_tag: int('viewport_meta_tag'),
  main_element_present: int('main_element_present'),
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
  third_party_service_count: int('third_party_service_count'),
  third_party_service_domains: text('third_party_service_domains'), // JSON array
  third_party_service_urls: text('third_party_service_urls'),       // JSON array
  cookie_domains: text('cookie_domains'),                            // JSON array
  source_list: text('source_list'),                                  // JSON array

  // Robots.txt
  robots_txt_detected: int('robots_txt_detected'),
  robots_txt_url: text('robots_txt_url'),
  robots_txt_status_code: int('robots_txt_status_code'),
  robots_txt_media_type: text('robots_txt_media_type'),
  robots_txt_filesize: int('robots_txt_filesize'),
  robots_txt_crawl_delay: double('robots_txt_crawl_delay'),
  robots_txt_sitemap_locations: text('robots_txt_sitemap_locations'), // JSON array

  // Sitemap
  sitemap_xml_detected: int('sitemap_xml_detected'),
  sitemap_xml_url: text('sitemap_xml_url'),
  sitemap_xml_status_code: int('sitemap_xml_status_code'),
  sitemap_xml_media_type: text('sitemap_xml_media_type'),
  sitemap_xml_filesize: int('sitemap_xml_filesize'),
  sitemap_xml_count: int('sitemap_xml_count'),
  sitemap_xml_lastmod: text('sitemap_xml_lastmod'),
  sitemap_xml_pdf_count: int('sitemap_xml_pdf_count'),
  sitemap_xml_page_hash: text('sitemap_xml_page_hash'),

  // USWDS
  uswds_favicon: int('uswds_favicon'),
  uswds_favicon_in_css: int('uswds_favicon_in_css'),
  uswds_publicsans_font: int('uswds_publicsans_font'),
  uswds_inpage_css: int('uswds_inpage_css'),
  uswds_string: int('uswds_string'),
  uswds_string_in_css: int('uswds_string_in_css'),
  uswds_version: int('uswds_version'),
  uswds_count: int('uswds_count'),
  uswds_usa_classes: int('uswds_usa_classes'),
  uswds_usa_class_list: text('uswds_usa_class_list'), // JSON array
  uswds_banner_heres_how: int('uswds_banner_heres_how'),
  uswds_semantic_version: text('uswds_semantic_version'),

  // Security
  https_enforced: int('https_enforced'),
  hsts: int('hsts'),

  // WWW check
  www_url: text('www_url'),
  www_status_code: int('www_status_code'),
  www_title: text('www_title'),

  // Local tracking
  imported_at: text('imported_at').notNull().default(TS_DEFAULT),
  updated_at: text('updated_at').notNull().default(TS_DEFAULT),
  // Manual exclusion — set to 1 to hide from Explorer and public views
  // Migration: ALTER TABLE sites ADD COLUMN excluded INT DEFAULT 0;
  excluded: int('excluded').default(0),
  // Computed during rescan: 1 = public-facing, 0 = internal/non-prod, NULL = not yet evaluated.
  // Mirrors PUBLIC_ONLY_CONDITION logic but stored for fast indexed lookups.
  // Orthogonal to `excluded` — combine as: is_public = 1 AND excluded = 0
  is_public: int('is_public'),
}, (table) => ({
  agencyIdx: index('idx_sites_agency').on(table.agency),
  bureauIdx: index('idx_sites_bureau').on(table.bureau),
  liveIdx: index('idx_sites_live').on(table.live),
  uswdsIdx: index('idx_sites_uswds').on(table.uswds_count),
  dapIdx: index('idx_sites_dap').on(table.dap),
  sitemapIdx: index('idx_sites_sitemap').on(table.sitemap_xml_detected),
  isPublicIdx: index('idx_sites_is_public').on(table.is_public),
}));

export const scan_history = mysqlTable('scan_history', {
  id: int('id').primaryKey().autoincrement(),
  domain: varchar('domain', { length: 255 }).notNull().references(() => sites.domain, { onDelete: 'cascade' }),
  scanned_at: text('scanned_at').notNull(),
  status: text('status').notNull(), // 'completed' | 'failed' | 'partial'
  redirect_chain: text('redirect_chain'),  // JSON
  sitemap_result: text('sitemap_result'),  // JSON
  robots_result: text('robots_result'),    // JSON
  tech_stack: text('tech_stack'),          // JSON
  dns_records: text('dns_records'),        // JSON
  diff_summary: text('diff_summary'),      // JSON
  error_log: text('error_log'),            // JSON array
  duration_ms: int('duration_ms'),
}, (table) => ({
  domainIdx: index('idx_scan_history_domain').on(table.domain),
  scannedAtIdx: index('idx_scan_history_scanned_at').on(table.scanned_at),
}));

export const briefings = mysqlTable('briefings', {
  id: int('id').primaryKey().autoincrement(),
  domain: varchar('domain', { length: 255 }).notNull().references(() => sites.domain, { onDelete: 'cascade' }),
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
  prompt_tokens: int('prompt_tokens'),
  completion_tokens: int('completion_tokens'),
  duration_ms: int('duration_ms'),
}, (table) => ({
  domainIdx: index('idx_briefings_domain').on(table.domain),
}));

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: text('value'),
  updated_at: text('updated_at').notNull().default(TS_DEFAULT),
});
