/**
 * Site row normalization — shared between routes/report.ts and mcp/tools.ts.
 *
 * Converts raw DB rows to clean output: parses JSON array columns,
 * coerces integers, structures wp_plugins, and strips nulls/empty values.
 */

export const INTEGER_FIELDS = new Set([
  'pageviews', 'wp_post_count', 'wp_page_count', 'wp_author_count',
  'wp_category_count', 'wp_tag_count', 'wp_media_total', 'wp_media_size_bytes',
  'third_party_service_count', 'uswds_count', 'sitemap_xml_count', 'sitemap_xml_filesize',
]);

export const ARRAY_FIELDS = new Set([
  'third_party_service_domains', 'third_party_service_urls',
  'detected_technologies', 'cookie_domains', 'robots_txt_sitemap_locations',
  'uswds_usa_class_list', 'analytics_platforms', 'wp_feeds',
  'wp_custom_post_types', 'required_links_url', 'required_links_text',
  'dns_a_records', 'dns_mx_records', 'dns_ns_records',
]);

// Fields always fetched from the DB for error detection and wp_plugins
// processing, but stripped from the site output unless explicitly requested.
export const INTERNAL_FETCH_FIELDS = new Set([
  'live', 'redirect', 'primary_scan_status', 'updated_at', 'wp_plugins_detailed',
]);

export function parsedArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { return JSON.parse(v); } catch {}
  }
  return [];
}

/**
 * Normalize a raw DB site row for API output.
 *
 * @param row          Raw row from the DB query.
 * @param outputFields Allowlist of fields to include. Pass null to keep all
 *                     fields (except wp_plugins_detailed which is always
 *                     omitted — its data is merged into wp_plugins).
 */
export function normalizeSite(
  row: Record<string, unknown>,
  outputFields: Set<string> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const detailedPlugins = parsedArray(row.wp_plugins_detailed) as any[];

  for (const [k, raw] of Object.entries(row)) {
    if (k === 'wp_plugins_detailed') continue;
    if (INTERNAL_FETCH_FIELDS.has(k) && outputFields && !outputFields.has(k)) continue;

    let v: unknown = raw;

    if (INTEGER_FIELDS.has(k)) {
      v = (v === null || v === undefined) ? null : Number(v);
    } else if (ARRAY_FIELDS.has(k)) {
      v = parsedArray(v);
    } else if (k === 'dap_parameters') {
      if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch { v = null; }
      }
    } else if (k === 'wp_plugins') {
      if (detailedPlugins.length > 0) {
        v = detailedPlugins.map((p: any) => ({
          name: p.slug ?? p.name ?? '',
          ...(p.version ? { version: p.version } : {}),
        }));
      } else {
        const slugs = parsedArray(v) as string[];
        v = slugs.length > 0 ? slugs.map(s => ({ name: s })) : [];
      }
    }

    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;

    out[k] = v;
  }

  return out;
}
