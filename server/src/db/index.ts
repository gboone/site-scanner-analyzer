import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

const dbDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(path.resolve(config.dbPath));

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Bootstrap tables if they don't exist (simple approach without drizzle-kit in dev)
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      domain TEXT PRIMARY KEY,
      name TEXT,
      url TEXT,
      base_domain TEXT,
      initial_url TEXT,
      initial_domain TEXT,
      initial_base_domain TEXT,
      initial_top_level_domain TEXT,
      top_level_domain TEXT,
      redirect INTEGER,
      live INTEGER,
      status_code INTEGER,
      media_type TEXT,
      page_hash TEXT,
      scan_date TEXT,
      test_404 INTEGER,
      agency TEXT,
      bureau TEXT,
      branch TEXT,
      primary_scan_status TEXT,
      accessibility_scan_status TEXT,
      dns_scan_status TEXT,
      not_found_scan_status TEXT,
      performance_scan_status TEXT,
      robots_txt_scan_status TEXT,
      security_scan_status TEXT,
      sitemap_xml_scan_status TEXT,
      www_scan_status TEXT,
      pageviews INTEGER,
      dap INTEGER,
      dap_parameters TEXT,
      dap_version TEXT,
      ga_tag_id TEXT,
      search_dot_gov TEXT,
      ipv6 INTEGER,
      hostname TEXT,
      cms TEXT,
      login_provider TEXT,
      site_search INTEGER,
      viewport_meta_tag INTEGER,
      main_element_present INTEGER,
      language TEXT,
      language_link TEXT,
      cumulative_layout_shift TEXT,
      largest_contentful_paint TEXT,
      title TEXT,
      description TEXT,
      keywords TEXT,
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      og_article_published TEXT,
      og_article_modified TEXT,
      og_type TEXT,
      og_url TEXT,
      canonical_link TEXT,
      required_links_url TEXT,
      required_links_text TEXT,
      third_party_service_count INTEGER,
      third_party_service_domains TEXT,
      third_party_service_urls TEXT,
      cookie_domains TEXT,
      source_list TEXT,
      robots_txt_detected INTEGER,
      robots_txt_url TEXT,
      robots_txt_status_code INTEGER,
      robots_txt_media_type TEXT,
      robots_txt_filesize INTEGER,
      robots_txt_crawl_delay REAL,
      robots_txt_sitemap_locations TEXT,
      sitemap_xml_detected INTEGER,
      sitemap_xml_url TEXT,
      sitemap_xml_status_code INTEGER,
      sitemap_xml_media_type TEXT,
      sitemap_xml_filesize INTEGER,
      sitemap_xml_count INTEGER,
      sitemap_xml_lastmod TEXT,
      sitemap_xml_pdf_count INTEGER,
      sitemap_xml_page_hash TEXT,
      uswds_favicon INTEGER,
      uswds_favicon_in_css INTEGER,
      uswds_publicsans_font INTEGER,
      uswds_inpage_css INTEGER,
      uswds_string INTEGER,
      uswds_string_in_css INTEGER,
      uswds_version INTEGER,
      uswds_count INTEGER,
      uswds_usa_classes INTEGER,
      uswds_usa_class_list TEXT,
      uswds_banner_heres_how INTEGER,
      uswds_semantic_version TEXT,
      https_enforced INTEGER,
      hsts INTEGER,
      www_url TEXT,
      www_status_code INTEGER,
      www_title TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sites_agency ON sites(agency);
    CREATE INDEX IF NOT EXISTS idx_sites_bureau ON sites(bureau);
    CREATE INDEX IF NOT EXISTS idx_sites_live ON sites(live);
    CREATE INDEX IF NOT EXISTS idx_sites_uswds ON sites(uswds_count);
    CREATE INDEX IF NOT EXISTS idx_sites_dap ON sites(dap);
    CREATE INDEX IF NOT EXISTS idx_sites_sitemap ON sites(sitemap_xml_detected);

    CREATE TABLE IF NOT EXISTS scan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL REFERENCES sites(domain) ON DELETE CASCADE,
      scanned_at TEXT NOT NULL,
      status TEXT NOT NULL,
      redirect_chain TEXT,
      sitemap_result TEXT,
      robots_result TEXT,
      tech_stack TEXT,
      dns_records TEXT,
      diff_summary TEXT,
      error_log TEXT,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_scan_history_domain ON scan_history(domain);
    CREATE INDEX IF NOT EXISTS idx_scan_history_scanned_at ON scan_history(scanned_at);

    CREATE TABLE IF NOT EXISTS briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL REFERENCES sites(domain) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      agency_identity TEXT,
      website_purpose TEXT,
      policy_objectives TEXT,
      recent_milestones TEXT,
      website_role TEXT,
      references_json TEXT,
      full_markdown TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_briefings_domain ON briefings(domain);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Add columns introduced by the GSA API importer that weren't in the original schema.
  // ALTER TABLE IF NOT EXISTS ... ADD COLUMN is safe to run on every startup.
  const addCol = (col: string, type = 'TEXT') => {
    try {
      sqlite.exec(`ALTER TABLE sites ADD COLUMN ${col} ${type}`);
    } catch {
      // Column already exists — ignore
    }
  };

  addCol('https', 'INTEGER');
  addCol('http_status_code', 'INTEGER');
  addCol('final_url');
  addCol('redirect_to');
  addCol('content_type');
  addCol('hsts_preloaded', 'INTEGER');
  addCol('dnssec', 'INTEGER');
  addCol('has_login', 'INTEGER');
  addCol('ga', 'INTEGER');
  addCol('script_tags');
  addCol('analytics_detected', 'INTEGER');
  addCol('analytics_platforms');
  addCol('source_code_url');
  addCol('site_search_detected', 'INTEGER');
  addCol('contact_email_address');
  addCol('contact_form_detected', 'INTEGER');
  addCol('accessibility_statement_detected', 'INTEGER');
  addCol('doge_url');
  addCol('uswds_merriweather_font', 'INTEGER');
  addCol('uswds_public_sans_font', 'INTEGER');
  addCol('uswds_source_sans_font', 'INTEGER');
  addCol('sitemap_xml_detected_by_robotstxt', 'INTEGER');

  // Columns populated by the client-side rescan / wp-analyze scanner
  addCol('hosting_provider');          // e.g. "Amazon Web Services (Route 53)"
  addCol('web_server');                // e.g. "Nginx", "Apache"
  addCol('cdn_provider');              // e.g. "Cloudflare", "Fastly"
  addCol('analytics_platforms');       // JSON array of detected analytics tools
  addCol('dns_a_records');             // JSON array of IPv4 addresses
  addCol('dns_aaaa_records');          // JSON array of IPv6 addresses
  addCol('dns_mx_records');            // JSON array of MX records
  addCol('dns_ns_records');            // JSON array of NS records
  addCol('wp_version');                // WordPress version string
  addCol('wp_theme');                  // Active theme slug
  addCol('wp_theme_version');          // Active theme version
  addCol('wp_plugins');                // JSON array of detectable plugin slugs
  addCol('last_scan_id', 'INTEGER');   // FK to scan_history.id of most recent scan

  // ── wp-analyze enrichment columns ──────────────────────────────────────────

  // Enriched sitemap content analysis
  addCol('sitemap_sitemaps_found', 'INTEGER');
  addCol('sitemap_content_types');         // JSON: Record<string, {count, percentage}>
  addCol('sitemap_url_patterns');          // JSON: [{segment, count, percentage}]
  addCol('sitemap_publishing_by_year');    // JSON: Record<string, number>
  addCol('sitemap_publishing_by_month');   // JSON: Record<string, number>
  addCol('sitemap_latest_update');         // ISO date string
  addCol('sitemap_has_clean_urls', 'INTEGER');
  addCol('sitemap_path_depth_avg', 'REAL');

  // WordPress REST API content data
  addCol('wp_json_api_active', 'INTEGER');
  addCol('wp_api_endpoints');              // JSON: string[] of namespace slugs
  addCol('wp_post_count', 'INTEGER');
  addCol('wp_page_count', 'INTEGER');
  addCol('wp_author_count', 'INTEGER');
  addCol('wp_category_count', 'INTEGER');
  addCol('wp_tag_count', 'INTEGER');
  addCol('wp_media_total', 'INTEGER');
  addCol('wp_media_size_bytes', 'INTEGER');
  addCol('wp_media_size_formatted');
  addCol('wp_plugins_detailed');           // JSON: WpPluginDetected[] (richer than wp_plugins)
  addCol('wp_feeds');                      // JSON: string[] of feed URLs
  addCol('wp_custom_post_types');          // JSON: string[] of non-standard CPT slugs

  // Generic technology detection & security headers
  addCol('detected_technologies');         // JSON: DetectedTechnology[]
  addCol('security_header_csp');           // Content-Security-Policy value
  addCol('security_header_xss');           // X-XSS-Protection value

  // Clean up any null-domain rows inserted by the old broken GSA importer
  // (safe no-op if there are no such rows)
  const deleted = sqlite.prepare('DELETE FROM sites WHERE domain IS NULL').run();
  if (deleted.changes > 0) {
    console.log(`  cleaned up ${deleted.changes} null-domain row(s) from previous import`);
  }

  console.log('✓ Database initialized');
}
