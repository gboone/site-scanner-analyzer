import type { DiffResult, DiffField } from 'shared';

// Fields to skip when diffing (timestamps, metadata)
const SKIP_FIELDS = new Set(['imported_at', 'updated_at', 'scan_date']);

// Fields that are JSON arrays/objects stored as strings
const JSON_FIELDS = new Set([
  'dap_parameters', 'third_party_service_domains', 'third_party_service_urls',
  'cookie_domains', 'source_list', 'required_links_url', 'required_links_text',
  'robots_txt_sitemap_locations', 'uswds_usa_class_list',
]);

function parseVal(key: string, val: unknown): unknown {
  if (JSON_FIELDS.has(key) && typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

export function computeDiff(before: Record<string, unknown>, after: Record<string, unknown>): DiffResult {
  const changed: DiffField[] = [];
  let unchanged_count = 0;

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;
    const bVal = parseVal(key, before[key]);
    const aVal = parseVal(key, after[key]);
    const bStr = JSON.stringify(bVal);
    const aStr = JSON.stringify(aVal);
    if (bStr !== aStr) {
      changed.push({ field: key, before: bVal, after: aVal });
    } else {
      unchanged_count++;
    }
  }

  return { changed, unchanged_count };
}
