/**
 * Shared data-simplification utility.
 *
 * Mirrors the client-side "simplified JSON export" logic and is used by both
 * the static HTML agent routes and the JSON API (when ?simplified=true).
 *
 * What it does (in order):
 *   1. Strip scanner-operational columns (SKIP_COLUMNS)
 *   2. Parse stringified JSON arrays
 *   3. Drop always-null/empty/zero-array columns  → recorded in global_null
 *   4. Drop constant columns (same value for every row) → recorded in global_redundant
 *   5. Drop prefix groups where every member is 0 across all rows → recorded in global_null
 *   6. Collapse URL arrays → unique root domains
 *   7. Drop columns whose collapsed values duplicate an already-kept column (silent dedup)
 */

export interface SimplifyResult {
  rows: Record<string, unknown>[];
  /** Column names dropped because every row value was null / empty / empty-array. */
  global_null: string[];
  /** Columns dropped because every row shared the same non-null value; maps name → value. */
  global_redundant: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Columns to always strip before simplification (scanner-operational metadata)
// ---------------------------------------------------------------------------

export const SKIP_COLUMNS = new Set([
  'scan_date',
  'primary_scan_status', 'accessibility_scan_status', 'dns_scan_status',
  'not_found_scan_status', 'performance_scan_status', 'robots_txt_scan_status',
  'security_scan_status', 'sitemap_xml_scan_status', 'www_scan_status',
  'page_hash', 'sitemap_xml_page_hash',
  'imported_at', 'updated_at',
  'excluded', 'is_public', 'is_public_reason',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRootDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    const knownSecondLevel = new Set(['co', 'gov', 'org', 'net', 'edu', 'ac', 'com', 'ltd', 'me']);
    if (parts.length >= 3 && knownSecondLevel.has(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function simplify(rows: Record<string, unknown>[]): SimplifyResult {
  if (rows.length === 0) return { rows: [], global_null: [], global_redundant: {} };

  // Step 1: strip SKIP_COLUMNS
  const stripped = rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!SKIP_COLUMNS.has(k)) out[k] = v;
    }
    return out;
  });

  // Step 2: parse stringified JSON arrays
  const parsed = stripped.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && v.startsWith('[')) {
        try { out[k] = JSON.parse(v); } catch { out[k] = v; }
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  const keys = Object.keys(parsed[0]);
  const globalNull: string[] = [];
  const globalRedundant: Record<string, unknown> = {};

  // Step 3 & 4: classify each key
  const keepKeys = keys.filter(k => {
    const values = parsed.map(r => r[k]);

    const allEmpty = values.every(v => v === null || v === undefined || v === '' ||
      (Array.isArray(v) && v.length === 0));
    if (allEmpty) {
      globalNull.push(k);
      return false;
    }

    const first = JSON.stringify(values[0]);
    if (values.every(v => JSON.stringify(v) === first)) {
      globalRedundant[k] = values[0];
      return false;
    }

    return true;
  });

  // Step 5: drop prefix groups where every member field is 0 across all rows
  const prefixGroups = new Map<string, string[]>();
  for (const k of keepKeys) {
    const prefix = k.includes('_') ? k.slice(0, k.indexOf('_')) : null;
    if (!prefix) continue;
    if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
    prefixGroups.get(prefix)!.push(k);
  }
  const zeroedPrefixes = new Set<string>();
  for (const [prefix, fields] of prefixGroups) {
    if (fields.length < 2) continue;
    if (fields.every(k => parsed.every(row => row[k] === 0))) zeroedPrefixes.add(prefix);
  }
  const prunedKeys = zeroedPrefixes.size > 0
    ? keepKeys.filter(k => {
        const prefix = k.includes('_') ? k.slice(0, k.indexOf('_')) : null;
        if (prefix && zeroedPrefixes.has(prefix)) {
          globalNull.push(k);
          return false;
        }
        return true;
      })
    : keepKeys;

  // Step 6: collapse URL arrays → unique root domains
  const transformed: Record<string, unknown[]> = {};
  for (const k of prunedKeys) {
    transformed[k] = parsed.map(row => {
      const v = row[k];
      if (Array.isArray(v) && v.length > 0 &&
          v.every(item => typeof item === 'string' && /^https?:\/\//.test(item))) {
        return [...new Set(v.map(extractRootDomain))];
      }
      return v;
    });
  }

  // Step 7: drop columns whose transformed values duplicate an already-kept column
  const seenSignatures = new Set<string>();
  const finalKeys = prunedKeys.filter(k => {
    const sig = JSON.stringify(transformed[k]);
    if (seenSignatures.has(sig)) return false;
    seenSignatures.add(sig);
    return true;
  });

  const finalRows = parsed.map((_, i) => {
    const out: Record<string, unknown> = {};
    for (const k of finalKeys) {
      const v = transformed[k][i];
      out[k] = typeof v === 'string' && v.length > 255 ? v.slice(0, 255) : v;
    }
    return out;
  });

  return { rows: finalRows, global_null: globalNull, global_redundant: globalRedundant };
}
