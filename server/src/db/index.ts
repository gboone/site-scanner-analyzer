import pg from 'pg';
import type { PoolClient } from 'pg';

// Return timestamps as ISO strings rather than JS Date objects so the rest of
// the app (which expects string values from SQLite) works without changes.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (val: string | null) =>
  val ? new Date(val).toISOString() : null
);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (val: string | null) =>
  val ? new Date(val).toISOString() : null
);

export const pool = new pg.Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432'),
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'scanner',
  max: 10,
  ssl: process.env.DB_SSL === 'false' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ---------------------------------------------------------------------------
// Convert :name → $1, $2, ... positional params (pg uses positional params)
// ---------------------------------------------------------------------------
export function toPositional(
  sql: string,
  params: Record<string, unknown>
): [string, unknown[]] {
  const args: unknown[] = [];
  const converted = sql.replace(/:(\w+)/g, (_, key) => {
    args.push(params[key]);
    return `$${args.length}`;
  });
  return [converted, args];
}

// ---------------------------------------------------------------------------
// SELECT helper → T[]
// ---------------------------------------------------------------------------
export async function query<T = Record<string, unknown>>(
  sql: string,
  args?: Record<string, unknown> | unknown[]
): Promise<T[]> {
  if (args && !Array.isArray(args)) {
    const [s, a] = toPositional(sql, args);
    return (await pool.query(s, a)).rows as T[];
  }
  return (await pool.query(sql, (args as unknown[]) ?? [])).rows as T[];
}

// ---------------------------------------------------------------------------
// INSERT / UPDATE / DELETE helper — use RETURNING for auto-increment IDs
// ---------------------------------------------------------------------------
export async function execute(
  sql: string,
  args?: Record<string, unknown> | unknown[]
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  if (args && !Array.isArray(args)) {
    const [s, a] = toPositional(sql, args);
    const r = await pool.query(s, a);
    return { rows: r.rows, rowCount: r.rowCount ?? 0 };
  }
  const r = await pool.query(sql, (args as unknown[]) ?? []);
  return { rows: r.rows, rowCount: r.rowCount ?? 0 };
}

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent, runs at startup
// ---------------------------------------------------------------------------
export async function initDb(): Promise<void> {
  // Use ADD COLUMN IF NOT EXISTS — clean, no try/catch needed in PostgreSQL
  const addCol = async (col: string, type = 'TEXT') => {
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
  };

  // ISO-format timestamp default for TEXT date columns
  const TS_DEFAULT = `to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

  await pool.query(`
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
      robots_txt_crawl_delay DOUBLE PRECISION,
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

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_agency  ON sites(agency)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_bureau  ON sites(bureau)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_live    ON sites(live)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_uswds   ON sites(uswds_count)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_dap     ON sites(dap)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_sitemap ON sites(sitemap_xml_detected)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_history (
      id SERIAL PRIMARY KEY,
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
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_domain     ON scan_history(domain)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_scanned_at ON scan_history(scanned_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS briefings (
      id SERIAL PRIMARY KEY,
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
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_briefings_domain ON briefings(domain)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
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
  await addCol('sitemap_path_depth_avg', 'DOUBLE PRECISION');
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
  const deleted = await pool.query('DELETE FROM sites WHERE domain IS NULL');
  if ((deleted.rowCount ?? 0) > 0) {
    console.log(`  cleaned up ${deleted.rowCount} null-domain row(s) from previous import`);
  }

  console.log('✓ Database initialized');
}
