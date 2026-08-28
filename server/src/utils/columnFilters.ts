/**
 * Shared column-filter utility.
 *
 * Parses `cf_<field>=value` + `cfm_<field>=mode` query params into SQL
 * conditions and bound parameters. Used by /api/v1/sites, /api/v1/report,
 * and /agent/sites.
 *
 * Modes: contains (default) | exact | excludes | gt | lt
 */
import type { Request } from 'express';

export const CF_FILTERABLE = new Set([
  'domain', 'name', 'url', 'base_domain', 'initial_url', 'initial_domain', 'top_level_domain',
  'media_type', 'scan_date', 'agency', 'bureau', 'branch', 'city', 'state',
  'hostname', 'cms', 'login_provider', 'language',
  'cumulative_layout_shift', 'largest_contentful_paint',
  'title', 'description', 'keywords', 'og_title', 'og_description', 'og_type', 'og_url', 'canonical_link',
  'dap_version', 'ga_tag_id', 'search_dot_gov',
  'sitemap_xml_url', 'sitemap_xml_lastmod',
  'uswds_semantic_version',
  'www_url', 'www_title', 'robots_txt_url',
  'imported_at', 'updated_at', 'is_public_reason',
  'status_code', 'pageviews', 'uswds_count', 'uswds_version', 'uswds_usa_classes',
  'sitemap_xml_count', 'sitemap_xml_pdf_count', 'sitemap_xml_status_code',
  'third_party_service_count', 'robots_txt_crawl_delay', 'robots_txt_status_code', 'www_status_code',
  'hosting_provider', 'web_server', 'cdn_provider', 'content_type',
  'analytics_platforms', 'source_code_url', 'contact_email_address',
  'security_header_csp', 'security_header_xss',
  'wp_version', 'wp_theme', 'wp_theme_version', 'wp_media_size_formatted',
  'wp_post_count', 'wp_page_count', 'wp_author_count', 'wp_media_total',
]);

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/i;

/**
 * Parse all `cf_*` / `cfm_*` params from a request into SQL fragments.
 * Returns conditions (AND-able) and named params to merge into your query params.
 *
 * Modes: contains (default) | exact | excludes | not_exact | gt | lt | is_null | is_not_null
 */
export function buildColumnFilters(req: Request): {
  conditions: string[];
  params: Record<string, unknown>;
} {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, rawVal] of Object.entries(req.query)) {
    if (!key.startsWith('cf_')) continue;
    const field = key.slice(3);
    if (!CF_FILTERABLE.has(field) || !IDENTIFIER_RE.test(field)) continue;
    const mode = String(req.query[`cfm_${field}`] ?? 'contains');

    // Null-check modes require no value
    if (mode === 'is_null') {
      conditions.push(`(\`${field}\` IS NULL OR \`${field}\` = '')`);
      continue;
    }
    if (mode === 'is_not_null') {
      conditions.push(`(\`${field}\` IS NOT NULL AND \`${field}\` != '')`);
      continue;
    }

    const val = String(rawVal ?? '').trim();
    if (!val) continue;
    const paramKey = `cf_${field}`;

    if (mode === 'exact') {
      conditions.push(`\`${field}\` = :${paramKey}`);
      params[paramKey] = val;
    } else if (mode === 'not_exact') {
      conditions.push(`(\`${field}\` != :${paramKey} OR \`${field}\` IS NULL)`);
      params[paramKey] = val;
    } else if (mode === 'excludes') {
      conditions.push(`(\`${field}\` NOT LIKE :${paramKey} OR \`${field}\` IS NULL)`);
      params[paramKey] = `%${val}%`;
    } else if (mode === 'gt') {
      conditions.push(`\`${field}\` > :${paramKey}`);
      params[paramKey] = Number(val);
    } else if (mode === 'lt') {
      conditions.push(`\`${field}\` < :${paramKey}`);
      params[paramKey] = Number(val);
    } else {
      conditions.push(`\`${field}\` LIKE :${paramKey}`);
      params[paramKey] = `%${val}%`;
    }
  }

  return { conditions, params };
}
