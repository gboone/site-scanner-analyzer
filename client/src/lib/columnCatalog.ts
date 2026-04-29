/**
 * Catalog of all columns available in the sites table.
 * Used by the column picker and column filter UI.
 */

export type ColType = 'text' | 'int' | 'boolean' | 'json' | 'date';

export interface ColumnMeta {
  field: string;
  label: string;
  type: ColType;
  group: string;
}

/** Types that support server-side text/numeric column filters */
export const FILTERABLE_TYPES: ColType[] = ['text', 'int', 'date'];

export const COLUMN_CATALOG: ColumnMeta[] = [
  // Core identification
  { field: 'domain',                label: 'Domain',               type: 'text',    group: 'Core' },
  { field: 'name',                  label: 'Site Name',            type: 'text',    group: 'Core' },
  { field: 'url',                   label: 'URL',                  type: 'text',    group: 'Core' },
  { field: 'base_domain',           label: 'Base Domain',          type: 'text',    group: 'Core' },
  { field: 'initial_url',           label: 'Initial URL',          type: 'text',    group: 'Core' },
  { field: 'initial_domain',        label: 'Initial Domain',       type: 'text',    group: 'Core' },
  { field: 'top_level_domain',      label: 'TLD',                  type: 'text',    group: 'Core' },
  // Status
  { field: 'live',                  label: 'Live',                 type: 'boolean', group: 'Status' },
  { field: 'redirect',              label: 'Redirect',             type: 'boolean', group: 'Status' },
  { field: 'status_code',           label: 'Status Code',          type: 'int',     group: 'Status' },
  { field: 'media_type',            label: 'Media Type',           type: 'text',    group: 'Status' },
  { field: 'scan_date',             label: 'Scan Date',            type: 'date',    group: 'Status' },
  { field: 'test_404',              label: '404 Test',             type: 'boolean', group: 'Status' },
  // Organization
  { field: 'agency',                label: 'Agency',               type: 'text',    group: 'Organization' },
  { field: 'bureau',                label: 'Bureau',               type: 'text',    group: 'Organization' },
  { field: 'branch',                label: 'Type / Branch',        type: 'text',    group: 'Organization' },
  { field: 'city',                  label: 'City',                 type: 'text',    group: 'Organization' },
  { field: 'state',                 label: 'State',                type: 'text',    group: 'Organization' },
  // Analytics
  { field: 'pageviews',             label: 'Page Views',           type: 'int',     group: 'Analytics' },
  { field: 'dap',                   label: 'DAP',                  type: 'boolean', group: 'Analytics' },
  { field: 'dap_version',           label: 'DAP Version',          type: 'text',    group: 'Analytics' },
  { field: 'ga_tag_id',             label: 'GA Tag ID',            type: 'text',    group: 'Analytics' },
  { field: 'search_dot_gov',        label: 'search.gov ID',        type: 'text',    group: 'Analytics' },
  // Technical
  { field: 'cms',                   label: 'CMS',                  type: 'text',    group: 'Technical' },
  { field: 'hostname',              label: 'Hostname',             type: 'text',    group: 'Technical' },
  { field: 'login_provider',        label: 'Login Provider',       type: 'text',    group: 'Technical' },
  { field: 'language',              label: 'Language',             type: 'text',    group: 'Technical' },
  { field: 'ipv6',                  label: 'IPv6',                 type: 'boolean', group: 'Technical' },
  { field: 'viewport_meta_tag',     label: 'Viewport Meta',        type: 'boolean', group: 'Technical' },
  { field: 'main_element_present',  label: '<main> Element',       type: 'boolean', group: 'Technical' },
  { field: 'site_search',           label: 'Site Search',          type: 'boolean', group: 'Technical' },
  { field: 'cumulative_layout_shift', label: 'CLS',                type: 'text',    group: 'Technical' },
  { field: 'largest_contentful_paint', label: 'LCP',              type: 'text',    group: 'Technical' },
  // SEO / Metadata
  { field: 'title',                 label: 'Page Title',           type: 'text',    group: 'SEO' },
  { field: 'description',           label: 'Meta Description',     type: 'text',    group: 'SEO' },
  { field: 'keywords',              label: 'Meta Keywords',        type: 'text',    group: 'SEO' },
  { field: 'og_title',              label: 'OG Title',             type: 'text',    group: 'SEO' },
  { field: 'og_description',        label: 'OG Description',       type: 'text',    group: 'SEO' },
  { field: 'og_type',               label: 'OG Type',              type: 'text',    group: 'SEO' },
  { field: 'og_url',                label: 'OG URL',               type: 'text',    group: 'SEO' },
  { field: 'canonical_link',        label: 'Canonical URL',        type: 'text',    group: 'SEO' },
  // USWDS
  { field: 'uswds_count',           label: 'USWDS Score',          type: 'int',     group: 'USWDS' },
  { field: 'uswds_semantic_version', label: 'USWDS Version',       type: 'text',    group: 'USWDS' },
  { field: 'uswds_favicon',         label: 'USWDS Favicon',        type: 'boolean', group: 'USWDS' },
  { field: 'uswds_publicsans_font', label: 'Public Sans Font',     type: 'boolean', group: 'USWDS' },
  { field: 'uswds_banner_heres_how', label: 'USWDS Banner',        type: 'boolean', group: 'USWDS' },
  { field: 'uswds_usa_classes',     label: 'USA Classes Count',    type: 'int',     group: 'USWDS' },
  { field: 'uswds_string',          label: 'USWDS String',         type: 'boolean', group: 'USWDS' },
  { field: 'uswds_version',         label: 'USWDS Version (int)',  type: 'int',     group: 'USWDS' },
  // Security
  { field: 'https_enforced',        label: 'HTTPS Enforced',       type: 'boolean', group: 'Security' },
  { field: 'hsts',                  label: 'HSTS',                 type: 'boolean', group: 'Security' },
  // Sitemap
  { field: 'sitemap_xml_detected',  label: 'Sitemap Detected',     type: 'boolean', group: 'Sitemap' },
  { field: 'sitemap_xml_url',       label: 'Sitemap URL',          type: 'text',    group: 'Sitemap' },
  { field: 'sitemap_xml_count',     label: 'Sitemap Entry Count',  type: 'int',     group: 'Sitemap' },
  { field: 'sitemap_xml_lastmod',   label: 'Sitemap Last Modified', type: 'text',   group: 'Sitemap' },
  { field: 'sitemap_xml_pdf_count', label: 'Sitemap PDF Count',    type: 'int',     group: 'Sitemap' },
  { field: 'sitemap_xml_status_code', label: 'Sitemap Status Code', type: 'int',   group: 'Sitemap' },
  // Robots.txt
  { field: 'robots_txt_detected',   label: 'Robots.txt Detected',  type: 'boolean', group: 'Robots.txt' },
  { field: 'robots_txt_url',        label: 'Robots.txt URL',       type: 'text',    group: 'Robots.txt' },
  { field: 'robots_txt_crawl_delay', label: 'Robots Crawl Delay',  type: 'int',     group: 'Robots.txt' },
  { field: 'robots_txt_status_code', label: 'Robots Status Code',  type: 'int',     group: 'Robots.txt' },
  // WWW check
  { field: 'www_url',               label: 'WWW URL',              type: 'text',    group: 'WWW Check' },
  { field: 'www_status_code',       label: 'WWW Status Code',      type: 'int',     group: 'WWW Check' },
  { field: 'www_title',             label: 'WWW Page Title',       type: 'text',    group: 'WWW Check' },
  // Technical (additional scan columns)
  { field: 'hosting_provider',      label: 'Hosting Provider',     type: 'text',    group: 'Technical' },
  { field: 'web_server',            label: 'Web Server',           type: 'text',    group: 'Technical' },
  { field: 'cdn_provider',          label: 'CDN Provider',         type: 'text',    group: 'Technical' },
  { field: 'content_type',          label: 'Content Type',         type: 'text',    group: 'Technical' },
  { field: 'hsts_preloaded',        label: 'HSTS Preloaded',       type: 'boolean', group: 'Technical' },
  { field: 'dnssec',                label: 'DNSSEC',               type: 'boolean', group: 'Technical' },
  { field: 'has_login',             label: 'Has Login',            type: 'boolean', group: 'Technical' },
  { field: 'analytics_detected',    label: 'Analytics Detected',   type: 'boolean', group: 'Technical' },
  { field: 'analytics_platforms',   label: 'Analytics Platforms',  type: 'text',    group: 'Technical' },
  { field: 'source_code_url',       label: 'Source Code URL',      type: 'text',    group: 'Technical' },
  { field: 'contact_email_address', label: 'Contact Email',        type: 'text',    group: 'Technical' },
  { field: 'contact_form_detected', label: 'Contact Form',         type: 'boolean', group: 'Technical' },
  { field: 'accessibility_statement_detected', label: 'Accessibility Statement', type: 'boolean', group: 'Technical' },
  { field: 'detected_technologies', label: 'Detected Technologies', type: 'json',   group: 'Technical' },
  { field: 'security_header_csp',   label: 'CSP Header',           type: 'text',    group: 'Technical' },
  { field: 'security_header_xss',   label: 'XSS Protection Header', type: 'text',  group: 'Technical' },
  // WordPress
  { field: 'wp_version',            label: 'WP Version',           type: 'text',    group: 'WordPress' },
  { field: 'wp_theme',              label: 'WP Theme',             type: 'text',    group: 'WordPress' },
  { field: 'wp_theme_version',      label: 'WP Theme Version',     type: 'text',    group: 'WordPress' },
  { field: 'wp_post_count',         label: 'WP Post Count',        type: 'int',     group: 'WordPress' },
  { field: 'wp_page_count',         label: 'WP Page Count',        type: 'int',     group: 'WordPress' },
  { field: 'wp_author_count',       label: 'WP Author Count',      type: 'int',     group: 'WordPress' },
  { field: 'wp_media_total',        label: 'WP Media Count',       type: 'int',     group: 'WordPress' },
  { field: 'wp_media_size_formatted', label: 'WP Media Size',      type: 'text',    group: 'WordPress' },
  { field: 'wp_json_api_active',    label: 'WP REST API Active',   type: 'boolean', group: 'WordPress' },
  { field: 'wp_plugins',            label: 'WP Plugins (JSON)',    type: 'json',    group: 'WordPress' },
  // DNS
  { field: 'dns_a_records',         label: 'DNS A Records',        type: 'json',    group: 'DNS' },
  { field: 'dns_mx_records',        label: 'DNS MX Records',       type: 'json',    group: 'DNS' },
  { field: 'dns_ns_records',        label: 'DNS NS Records',       type: 'json',    group: 'DNS' },
  // Third-party
  { field: 'third_party_service_count', label: 'Third-party Count', type: 'int',   group: 'Third-party' },
  { field: 'third_party_service_domains', label: 'Third-party Domains', type: 'json', group: 'Third-party' },
  { field: 'cookie_domains',        label: 'Cookie Domains',       type: 'json',    group: 'Third-party' },
  // Timestamps
  { field: 'imported_at',           label: 'Imported At',          type: 'date',    group: 'Timestamps' },
  { field: 'updated_at',            label: 'Last Updated',         type: 'date',    group: 'Timestamps' },
  // Computed
  { field: 'is_public',             label: 'Is Public',            type: 'boolean', group: 'Computed' },
  { field: 'is_public_reason',      label: 'Non-public Reason',    type: 'text',    group: 'Computed' },
  { field: 'excluded',              label: 'Excluded',             type: 'boolean', group: 'Computed' },
];

/** Fields shown by default in the table — excluded from the "Add column" picker */
export const BASE_COLUMN_FIELDS = new Set([
  'domain', 'agency', 'branch', 'state', 'live', 'status_code',
  'uswds_count', 'dap', 'sitemap_xml_detected', 'https_enforced', 'cms', 'title',
]);

/** Look up metadata for a field, falling back to a minimal stub */
export function getColumnMeta(field: string): ColumnMeta {
  return (
    COLUMN_CATALOG.find((c) => c.field === field) ?? {
      field,
      label: field,
      type: 'text',
      group: 'Other',
    }
  );
}
