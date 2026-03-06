import mysql from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';

// Parse host and port from VIP_MARIADB_WRITE_HOSTS ("127.0.0.1:3306")
function parseWriteHost(hosts?: string): { host: string; port: number } {
  if (!hosts) return { host: 'localhost', port: 3306 };
  const [host, portStr] = hosts.split(':');
  return { host: host || 'localhost', port: portStr ? parseInt(portStr, 10) : 3306 };
}

const { host, port } = parseWriteHost(process.env.VIP_MARIADB_WRITE_HOSTS);

export const pool = mysql.createPool({
  host,
  port,
  user:            process.env.VIP_MARIADB_USER     ?? 'root',
  password:        process.env.VIP_MARIADB_PASSWORD ?? '',
  database:        process.env.VIP_MARIADB_NAME     ?? 'scanner',
  connectionLimit: 10,
  // Return date/time column values as strings (preserves existing ISO-string behavior)
  dateStrings:     true,
  supportBigNumbers: true,
  bigNumberStrings:  false,
});

// ---------------------------------------------------------------------------
// Convert :name → ? positional params (mysql2 uses ? placeholders)
// ---------------------------------------------------------------------------
export function toPositional(
  sql: string,
  params: Record<string, unknown>
): [string, any[]] {
  const args: any[] = [];
  const converted = sql.replace(/:(\w+)/g, (_, key) => {
    args.push(params[key]);
    return '?';
  });
  return [converted, args];
}

// ---------------------------------------------------------------------------
// SELECT helper → T[]
// ---------------------------------------------------------------------------
// Uses pool.query() (text protocol / client-side escaping) rather than
// pool.execute() (binary prepared-statement protocol) for broad compatibility
// with MySQL proxies such as VIP's ProxySQL, which may not support the binary
// prepared-statement wire format or parameterised LIMIT/OFFSET.
export async function query<T = Record<string, unknown>>(
  sql: string,
  args?: Record<string, unknown> | any[]
): Promise<T[]> {
  if (args && !Array.isArray(args)) {
    const [s, a] = toPositional(sql, args);
    const [rows] = await pool.query(s, a);
    return rows as T[];
  }
  const [rows] = await pool.query(sql, (args as any[]) ?? []);
  return rows as T[];
}

// ---------------------------------------------------------------------------
// INSERT / UPDATE / DELETE helper
// ---------------------------------------------------------------------------
export async function execute(
  sql: string,
  args?: Record<string, unknown> | any[]
): Promise<{ rows: Record<string, unknown>[]; rowCount: number; insertId: number }> {
  if (args && !Array.isArray(args)) {
    const [s, a] = toPositional(sql, args);
    const [result] = await pool.query(s, a) as any;
    return { rows: [], rowCount: result.affectedRows ?? 0, insertId: result.insertId ?? 0 };
  }
  const [result] = await pool.query(sql, (args as any[]) ?? []) as any;
  return { rows: [], rowCount: result.affectedRows ?? 0, insertId: result.insertId ?? 0 };
}

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------
export async function transaction<T>(
  fn: (client: PoolConnection) => Promise<T>
): Promise<T> {
  const client = await pool.getConnection();
  try {
    await client.beginTransaction();
    const result = await fn(client);
    await client.commit();
    return result;
  } catch (e) {
    await client.rollback();
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent, runs at startup
// ---------------------------------------------------------------------------
export async function initDb(): Promise<void> {
  // ADD COLUMN — silently ignores ER_DUP_FIELDNAME (1060) so this is idempotent
  // on both MySQL and MariaDB (ALTER TABLE … IF NOT EXISTS is MariaDB-only).
  const addCol = async (col: string, type = 'TEXT') => {
    try {
      await pool.query(`ALTER TABLE sites ADD COLUMN \`${col}\` ${type}`);
    } catch (err: any) {
      if (err.errno !== 1060) throw err; // 1060 = ER_DUP_FIELDNAME: column already exists
    }
  };

  // ISO-format UTC timestamp default for TEXT date columns (MySQL 8.0.13+)
  const TS_DEFAULT = `DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%SZ')`;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sites (
      domain VARCHAR(255) PRIMARY KEY,
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
      robots_txt_crawl_delay DOUBLE,
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
      imported_at TEXT NOT NULL DEFAULT (${TS_DEFAULT}),
      updated_at TEXT NOT NULL DEFAULT (${TS_DEFAULT})
    )
  `);

  // CREATE INDEX — silently ignores ER_DUP_KEYNAME (1061) so this is idempotent
  // on both MySQL and MariaDB (CREATE INDEX IF NOT EXISTS is MariaDB-only).
  // TEXT columns require a prefix length (191 = safe max for utf8mb4 3-byte chars).
  const createIndex = async (name: string, table: string, col: string, prefix?: number) => {
    const colSpec = prefix ? `\`${col}\`(${prefix})` : `\`${col}\``;
    try {
      await pool.query(`CREATE INDEX \`${name}\` ON \`${table}\`(${colSpec})`);
    } catch (err: any) {
      if (err.errno !== 1061) throw err; // 1061 = ER_DUP_KEYNAME: index already exists
    }
  };

  await createIndex('idx_sites_agency',  'sites', 'agency',            191); // TEXT col
  await createIndex('idx_sites_bureau',  'sites', 'bureau',            191); // TEXT col
  await createIndex('idx_sites_live',    'sites', 'live');
  await createIndex('idx_sites_uswds',   'sites', 'uswds_count');
  await createIndex('idx_sites_dap',     'sites', 'dap');
  await createIndex('idx_sites_sitemap', 'sites', 'sitemap_xml_detected');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain VARCHAR(255) NOT NULL,
      scanned_at TEXT NOT NULL,
      status TEXT NOT NULL,
      redirect_chain TEXT,
      sitemap_result TEXT,
      robots_result TEXT,
      tech_stack TEXT,
      dns_records TEXT,
      diff_summary TEXT,
      error_log TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (domain) REFERENCES sites(domain) ON DELETE CASCADE
    )
  `);
  await createIndex('idx_scan_history_domain',     'scan_history', 'domain');
  await createIndex('idx_scan_history_scanned_at', 'scan_history', 'scanned_at', 191); // TEXT col

  await pool.query(`
    CREATE TABLE IF NOT EXISTS briefings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain VARCHAR(255) NOT NULL,
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
      duration_ms INTEGER,
      FOREIGN KEY (domain) REFERENCES sites(domain) ON DELETE CASCADE
    )
  `);
  await createIndex('idx_briefings_domain', 'briefings', 'domain');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'running',
      total_domains INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      label TEXT
    )
  `);
  await createIndex('idx_scan_sessions_started_at', 'scan_sessions', 'started_at', 191);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(255) PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (${TS_DEFAULT})
    )
  `);

  // ADD COLUMN IF NOT EXISTS — columns introduced by GSA importer or client-side scanner
  await addCol('https', 'INTEGER');
  await addCol('http_status_code', 'INTEGER');
  await addCol('final_url');
  await addCol('redirect_to');
  await addCol('content_type');
  await addCol('hsts_preloaded', 'INTEGER');
  await addCol('dnssec', 'INTEGER');
  await addCol('has_login', 'INTEGER');
  await addCol('ga', 'INTEGER');
  await addCol('script_tags');
  await addCol('analytics_detected', 'INTEGER');
  await addCol('analytics_platforms');
  await addCol('source_code_url');
  await addCol('site_search_detected', 'INTEGER');
  await addCol('contact_email_address');
  await addCol('contact_form_detected', 'INTEGER');
  await addCol('accessibility_statement_detected', 'INTEGER');
  await addCol('doge_url');
  await addCol('uswds_merriweather_font', 'INTEGER');
  await addCol('uswds_public_sans_font', 'INTEGER');
  await addCol('uswds_source_sans_font', 'INTEGER');
  await addCol('sitemap_xml_detected_by_robotstxt', 'INTEGER');
  await addCol('hosting_provider');
  await addCol('web_server');
  await addCol('cdn_provider');
  await addCol('dns_a_records');
  await addCol('dns_aaaa_records');
  await addCol('dns_mx_records');
  await addCol('dns_ns_records');
  await addCol('wp_version');
  await addCol('wp_theme');
  await addCol('wp_theme_version');
  await addCol('wp_plugins');
  await addCol('last_scan_id', 'INTEGER');
  await addCol('sitemap_sitemaps_found', 'INTEGER');
  await addCol('sitemap_content_types');
  await addCol('sitemap_url_patterns');
  await addCol('sitemap_publishing_by_year');
  await addCol('sitemap_publishing_by_month');
  await addCol('sitemap_latest_update');
  await addCol('sitemap_has_clean_urls', 'INTEGER');
  await addCol('sitemap_path_depth_avg', 'DOUBLE');
  await addCol('wp_json_api_active', 'INTEGER');
  await addCol('wp_api_endpoints');
  await addCol('wp_post_count', 'INTEGER');
  await addCol('wp_page_count', 'INTEGER');
  await addCol('wp_author_count', 'INTEGER');
  await addCol('wp_category_count', 'INTEGER');
  await addCol('wp_tag_count', 'INTEGER');
  await addCol('wp_media_total', 'INTEGER');
  await addCol('wp_media_size_bytes', 'INTEGER');
  await addCol('wp_media_size_formatted');
  await addCol('wp_plugins_detailed');
  await addCol('wp_feeds');
  await addCol('wp_custom_post_types');
  await addCol('detected_technologies');
  await addCol('security_header_csp');
  await addCol('security_header_xss');

  // Clean up any null-domain rows from old broken imports
  const [deleted] = await pool.query('DELETE FROM sites WHERE domain IS NULL') as any;
  if ((deleted.affectedRows ?? 0) > 0) {
    console.log(`  cleaned up ${deleted.affectedRows} null-domain row(s) from previous import`);
  }

  console.log('✓ Database initialized');
}
