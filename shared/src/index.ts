// ─── GSA Site Scanner record (97 fields) ──────────────────────────────────

export interface SiteRecord {
  // Core identification
  name: string;
  initial_url: string;
  initial_domain: string;
  initial_base_domain: string;
  initial_top_level_domain: string;
  url: string;
  domain: string;
  base_domain: string;
  top_level_domain: string;

  // Status
  redirect: boolean;
  live: boolean;
  filter: null;
  status_code: number;
  media_type: string;
  page_hash: string | null;
  scan_date: string;
  '404_test': boolean;

  // Organization
  agency: string;
  bureau: string;
  branch: string;

  // Scan statuses
  primary_scan_status: string | null;
  accessibility_scan_status: string | null;
  dns_scan_status: string | null;
  not_found_scan_status: string | null;
  performance_scan_status: string | null;
  robots_txt_scan_status: string | null;
  security_scan_status: string | null;
  sitemap_xml_scan_status: string | null;
  www_scan_status: string | null;

  // Analytics
  pageviews: number;
  visits: null;
  dap: boolean;
  dap_parameters: Record<string, string> | null;
  dap_version: string | null;
  ga_tag_id: string | null;
  search_dot_gov: string | null;

  // Technical
  ipv6: boolean;
  hostname: string | null;
  cms: string | null;
  login_provider: string | null;
  login: null;
  site_search: boolean;
  viewport_meta_tag: boolean;
  main_element_present: boolean;
  language: string | null;
  language_link: string | null;
  cumulative_layout_shift: string | null;
  largest_contentful_paint: string | null;
  accessibility_violations: null;

  // Metadata/SEO
  title: string | null;
  description: string | null;
  keywords: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_article_published: string | null;
  og_article_modified: string | null;
  og_type: string | null;
  og_url: string | null;
  canonical_link: string | null;
  required_links_url: string[] | null;
  required_links_text: string[] | null;

  // Third-party services
  third_party_service_count: number;
  third_party_service_domains: string[];
  third_party_service_urls: string[];
  cookie_domains: string[];
  source_list: string[];

  // Robots.txt
  robots_txt_detected: boolean;
  robots_txt_url: string;
  robots_txt_status_code: number;
  robots_txt_media_type: string | null;
  robots_txt_filesize: number | null;
  robots_txt_crawl_delay: number | null;
  robots_txt_sitemap_locations: string[] | null;

  // Sitemap
  sitemap_xml_detected: boolean;
  sitemap_xml_url: string;
  sitemap_xml_status_code: number;
  sitemap_xml_media_type: string | null;
  sitemap_xml_filesize: number | null;
  sitemap_xml_count: number | null;
  sitemap_xml_lastmod: string | null;
  sitemap_xml_pdf_count: number | null;
  sitemap_xml_page_hash: string | null;

  // USWDS
  uswds_favicon: number;
  uswds_favicon_in_css: number;
  uswds_publicsans_font: number;
  uswds_inpage_css: number;
  uswds_string: number;
  uswds_string_in_css: number;
  uswds_version: number;
  uswds_count: number;
  uswds_usa_classes: number;
  uswds_usa_class_list: string[] | null;
  uswds_banner_heres_how: boolean;
  uswds_semantic_version: string | null;

  // Security
  https_enforced: boolean;
  hsts: boolean;

  // WWW check
  www_url: string | null;
  www_status_code: number | null;
  www_title: string | null;

  // Local tracking (added on import)
  imported_at?: string;
  updated_at?: string;
}

// ─── Scan result types ─────────────────────────────────────────────────────

export interface RedirectHop {
  url: string;
  status_code: number;
  timestamp: string;
}

export interface RedirectChainResult {
  original_url: string;
  final_url: string;
  was_redirected: boolean;
  hops: RedirectHop[];
  total_hops: number;
}

export interface SitemapContentType {
  count: number;
  percentage: number;
}

export interface SitemapResult {
  detected: boolean;
  url: string;
  status_code: number;
  page_count: number | null;
  pdf_count: number | null;
  filesize: number | null;
  lastmod: string | null;
  error?: string;
  // Enriched content analysis (populated when a sitemap index is found)
  sitemaps_found?: number;
  content_types?: Record<string, SitemapContentType>;
  url_patterns?: Array<{ segment: string; count: number; percentage: number }>;
  publishing_by_year?: Record<string, number>;
  publishing_by_month?: Record<string, number>;
  latest_update?: string | null;
  has_clean_urls?: boolean;
  has_node_ids?: boolean;
  path_depth_avg?: number | null;
}

export interface RobotsResult {
  detected: boolean;
  url: string;
  status_code: number;
  filesize: number | null;
  crawl_delay: number | null;
  sitemap_locations: string[] | null;
  error?: string;
}

export interface UswdsResult {
  count: number;
  usa_classes: number;
  usa_class_list: string[];
  favicon: number;
  favicon_in_css: number;
  publicsans_font: number;
  inpage_css: number;
  string: number;
  string_in_css: number;
  version: number;
  semantic_version: string | null;
  banner_heres_how: boolean;
}

export interface DapResult {
  detected: boolean;
  parameters: Record<string, string> | null;
  version: string | null;
  ga_tag_id: string | null;
}

export interface WpPluginDetected {
  slug: string;
  name: string;
  detection_method: 'file_paths' | 'html_signatures' | 'rest_api_namespaces';
  confidence: 'high' | 'medium' | 'low';
  api_namespace?: string;
}

export interface WordPressContentResult {
  json_api_active: boolean;
  json_api_endpoints: string[];       // namespace slugs from /wp-json/
  post_count: number | null;
  page_count: number | null;
  author_count: number | null;
  category_count: number | null;
  tag_count: number | null;
  media_total: number | null;
  media_size_bytes: number | null;
  media_size_formatted: string | null;
  media_scan_complete: boolean;
  detected_plugins: WpPluginDetected[];
  feeds: string[];
  custom_post_types: string[];        // non-standard post type slugs
}

export interface WordPressResult {
  version: string | null;
  theme: string | null;
  theme_version: string | null;
  plugins: string[];                  // HTML-detected slugs (fast, no extra requests)
  content: WordPressContentResult | null; // REST API enrichment (when API is accessible)
}

export interface DetectedTechnology {
  name: string;
  category: string;
}

export interface SecurityHeaders {
  csp: string | null;
  xss_protection: string | null;
}

export interface TechStackResult {
  cms: string | null;
  web_server: string | null;
  analytics: string[];
  cdn: string | null;
  hosting_provider: string | null;  // inferred from NS/server headers
  wordpress: WordPressResult | null; // only set when cms === 'WordPress'
  technologies: DetectedTechnology[]; // generic JS libs, frameworks, etc.
  security_headers: SecurityHeaders;
  uswds: UswdsResult;
  dap: DapResult;
  https_enforced: boolean;
  hsts: boolean;
  /** True when the fetched page appears to be a login/auth gate rather than public content */
  login_gate: boolean;
}

export interface DnsResult {
  a_records: string[];
  aaaa_records: string[];
  mx_records: string[];
  ns_records: string[];
  ipv6: boolean;
  hosting_provider: string | null;  // inferred from NS records
}

export interface ScanResult {
  domain: string;
  scanned_at: string;
  status: 'completed' | 'failed' | 'partial';
  redirect_chain: RedirectChainResult | null;
  sitemap: SitemapResult | null;
  robots: RobotsResult | null;
  tech_stack: TechStackResult | null;
  dns: DnsResult | null;
  errors: string[];
  duration_ms: number;
  /** Computed after all modules finish: true = 2xx + not a login gate + not Basic Auth */
  live: boolean | null;
}

export interface DiffField {
  field: string;
  before: unknown;
  after: unknown;
}

export interface DiffResult {
  changed: DiffField[];
  unchanged_count: number;
}

// ─── Scan history ──────────────────────────────────────────────────────────

export interface ScanHistoryEntry {
  id: number;
  domain: string;
  scanned_at: string;
  status: string;
  redirect_chain: RedirectChainResult | null;
  sitemap_result: SitemapResult | null;
  robots_result: RobotsResult | null;
  tech_stack: TechStackResult | null;
  dns_records: DnsResult | null;
  diff_summary: DiffResult | null;
  error_log: string[];
  duration_ms: number;
}

// ─── Briefings ─────────────────────────────────────────────────────────────

export interface BriefingReference {
  title: string;
  url: string;
  verified: boolean;
  status: number | null;
  description: string;
}

export interface Briefing {
  id: number;
  domain: string;
  created_at: string;
  provider: 'glean' | 'claude';
  model: string | null;
  agency_identity: string | null;
  website_purpose: string | null;
  policy_objectives: string | null;
  recent_milestones: string | null;
  website_role: string | null;
  references: BriefingReference[];
  full_markdown: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
}

// ─── API response types ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface StatsResponse {
  total_sites: number;
  live_count: number;
  live_pct: number;
  uswds_any_count: number;
  uswds_any_pct: number;
  dap_count: number;
  dap_pct: number;
  https_enforced_count: number;
  https_enforced_pct: number;
  sitemap_detected_count: number;
  sitemap_detected_pct: number;
  by_agency: Array<{ agency: string; count: number }>;
  by_bureau: Array<{ bureau: string; count: number; uswds_avg: number; dap_pct: number }>;
  top_third_party_domains: Array<{ domain: string; site_count: number }>;
  sitemap_health: { detected: number; not_detected: number; error: number };
}

export interface ImportResult {
  inserted: number;
  updated: number;
  errors: string[];
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  count: number;
  duration_ms: number;
}
