import type { ApiMeta } from 'shared';
import { getRouteEntry, type RouteKey } from './apiRegistry';

/**
 * Builds the static `meta` navigation block for a route's JSON response:
 * what you just called (`self`) and a fixed list of sibling endpoints worth
 * exploring next (`related`), both sourced from API_REGISTRY.
 */
export function metaFor(key: RouteKey): ApiMeta {
  const entry = getRouteEntry(key);
  return {
    self: { method: entry.method, path: entry.path, description: entry.description },
    related: (entry.related ?? []).map((relatedKey) => {
      const related = getRouteEntry(relatedKey);
      return { method: related.method, path: related.path, description: related.description };
    }),
  };
}
