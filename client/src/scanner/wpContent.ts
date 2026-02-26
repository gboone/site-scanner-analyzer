/**
 * WordPress REST API content analysis.
 * Queries /wp-json/ and related endpoints to extract post counts, media library
 * size, plugin list (via API namespaces), custom post types, and feed URLs.
 *
 * Only called when CMS has been confirmed as WordPress.
 * Degrades gracefully — if the REST API is blocked, returns json_api_active: false
 * with all numeric fields null.
 */

import { fetchWithTimeout } from './fetch';
import type { WordPressContentResult, WpPluginDetected } from 'shared';

const TIMEOUT = 10_000;

/** Read the X-WP-Total header from a paginated WP REST response. */
function wpTotal(res: Response): number | null {
  const v = res.headers.get('X-WP-Total');
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) ? null : n;
}

/** Slugify an API namespace to a plugin slug guess (e.g. "rank-math/v1" → "rank-math") */
function namespaceToSlug(ns: string): string {
  return ns.split('/')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/** Format bytes into a human-readable string */
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

/** Known WP core API namespaces to exclude from plugin detection */
const CORE_NAMESPACES = new Set([
  'wp/v2', 'wp-block-editor/v1', 'wp-site-health/v1', 'wp-abilities/v1',
  'oembed/1.0', 'automattic/v1',
]);

export async function analyzeWpContent(baseUrl: string): Promise<WordPressContentResult> {
  const base = baseUrl.replace(/\/$/, '');
  const empty: WordPressContentResult = {
    json_api_active: false,
    json_api_endpoints: [],
    post_count: null,
    page_count: null,
    author_count: null,
    category_count: null,
    tag_count: null,
    media_total: null,
    media_size_bytes: null,
    media_size_formatted: null,
    media_scan_complete: false,
    detected_plugins: [],
    feeds: [],
    custom_post_types: [],
  };

  // ── Step 1: Probe /wp-json/ root ──────────────────────────────────────────
  let rootData: any = null;
  try {
    const res = await fetchWithTimeout(`${base}/wp-json/`, { timeoutMs: TIMEOUT });
    if (!res.ok) return empty;
    rootData = await res.json();
  } catch {
    return empty;
  }

  const namespaces: string[] = Array.isArray(rootData?.namespaces) ? rootData.namespaces : [];
  const routes: string[] = rootData?.routes ? Object.keys(rootData.routes) : [];

  // Collect endpoint namespace slugs (strip leading /wp/v2/ style paths to readable names)
  const endpointSlugs = namespaces.filter(ns => !CORE_NAMESPACES.has(ns));

  // Detect custom post types from routes: anything under /wp/v2/<type> that isn't a built-in
  const builtinTypes = new Set(['posts', 'pages', 'media', 'comments', 'blocks', 'users',
    'categories', 'tags', 'settings', 'statuses', 'types', 'taxonomies', 'themes',
    'plugins', 'search', 'templates', 'template-parts', 'navigation', 'menus', 'menu-items',
    'menu-locations', 'sidebars', 'widgets', 'widget-types', 'global-styles',
    'font-families', 'font-collections', 'block-types', 'block-renderer', 'block-patterns',
    'block-directory', 'pattern-directory', 'autosaves', 'revisions']);

  const customPostTypes: string[] = [];
  for (const route of routes) {
    const m = route.match(/^\/wp\/v2\/([a-z0-9_-]+)$/);
    if (m && !builtinTypes.has(m[1])) {
      customPostTypes.push(m[1]);
    }
  }

  // ── Step 2: Plugin detection from namespaces ──────────────────────────────
  const pluginMap = new Map<string, WpPluginDetected>();

  for (const ns of namespaces) {
    if (CORE_NAMESPACES.has(ns)) continue;
    const slug = namespaceToSlug(ns);
    if (!pluginMap.has(slug)) {
      pluginMap.set(slug, {
        slug,
        name: slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        detection_method: 'rest_api_namespaces',
        confidence: 'high',
        api_namespace: ns,
      });
    }
  }

  // ── Step 3: Parallel content counts ──────────────────────────────────────
  const [postsRes, pagesRes, usersRes, catsRes, tagsRes, mediaRes] = await Promise.allSettled([
    fetchWithTimeout(`${base}/wp-json/wp/v2/posts?per_page=1`, { timeoutMs: TIMEOUT }),
    fetchWithTimeout(`${base}/wp-json/wp/v2/pages?per_page=1`, { timeoutMs: TIMEOUT }),
    fetchWithTimeout(`${base}/wp-json/wp/v2/users?per_page=100`, { timeoutMs: TIMEOUT }),
    fetchWithTimeout(`${base}/wp-json/wp/v2/categories?per_page=1`, { timeoutMs: TIMEOUT }),
    fetchWithTimeout(`${base}/wp-json/wp/v2/tags?per_page=1`, { timeoutMs: TIMEOUT }),
    fetchWithTimeout(`${base}/wp-json/wp/v2/media?per_page=100&_fields=id,media_details`, { timeoutMs: TIMEOUT }),
  ]);

  const postCount = postsRes.status === 'fulfilled' && postsRes.value.ok
    ? wpTotal(postsRes.value) : null;
  const pageCount = pagesRes.status === 'fulfilled' && pagesRes.value.ok
    ? wpTotal(pagesRes.value) : null;

  let authorCount: number | null = null;
  if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
    // X-WP-Total may be absent if author enumeration is blocked; fall back to array length
    authorCount = wpTotal(usersRes.value);
    if (authorCount === null) {
      try {
        const users = await usersRes.value.json();
        authorCount = Array.isArray(users) ? users.length : null;
      } catch { /* ignore */ }
    }
  }

  const categoryCount = catsRes.status === 'fulfilled' && catsRes.value.ok
    ? wpTotal(catsRes.value) : null;
  const tagCount = tagsRes.status === 'fulfilled' && tagsRes.value.ok
    ? wpTotal(tagsRes.value) : null;

  // ── Step 4: Media library ─────────────────────────────────────────────────
  let mediaTotal: number | null = null;
  let mediaSizeBytes: number | null = null;
  let mediaSizeFormatted: string | null = null;
  let mediaScanComplete = false;

  if (mediaRes.status === 'fulfilled' && mediaRes.value.ok) {
    mediaTotal = wpTotal(mediaRes.value);
    try {
      const mediaItems: any[] = await mediaRes.value.json();
      let sizeSum = 0;
      for (const item of mediaItems) {
        const filesize = item?.media_details?.filesize ?? item?.media_details?.sizes?.full?.filesize;
        if (typeof filesize === 'number') sizeSum += filesize;
      }
      if (sizeSum > 0) {
        mediaSizeBytes = sizeSum;
        mediaSizeFormatted = formatBytes(sizeSum);
      }
      // If we got fewer items than the total, scan is incomplete
      mediaScanComplete = mediaTotal !== null && mediaItems.length >= mediaTotal;
    } catch { /* ignore */ }
  }

  // ── Step 5: Feed detection ────────────────────────────────────────────────
  const feedCandidates = [`${base}/feed/`, `${base}/rss/`, `${base}/atom/`];
  const feedResults = await Promise.allSettled(
    feedCandidates.map(url => fetchWithTimeout(url, { timeoutMs: 6000 }))
  );
  const feeds: string[] = feedCandidates.filter(
    (_, i) => feedResults[i].status === 'fulfilled' &&
      (feedResults[i] as PromiseFulfilledResult<Response>).value.ok
  );

  return {
    json_api_active: true,
    json_api_endpoints: endpointSlugs,
    post_count: postCount,
    page_count: pageCount,
    author_count: authorCount,
    category_count: categoryCount,
    tag_count: tagCount,
    media_total: mediaTotal,
    media_size_bytes: mediaSizeBytes,
    media_size_formatted: mediaSizeFormatted,
    media_scan_complete: mediaScanComplete,
    detected_plugins: Array.from(pluginMap.values()),
    feeds,
    custom_post_types: customPostTypes,
  };
}
