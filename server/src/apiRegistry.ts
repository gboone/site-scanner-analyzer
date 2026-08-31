import fs from 'fs';
import path from 'path';

// Read directly from package.json rather than `import`-ing it: apiRegistry.ts
// lives under src/ (tsc rootDir) while package.json lives one level up, and a
// static import there trips "file is not under rootDir". __dirname resolves
// correctly at runtime in both dev (tsx, src/) and prod (dist/) since dist/
// mirrors src/ one level down from package.json either way.
function readPackageVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8');
    return JSON.parse(raw).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

export interface RouteParam {
  type: string;
  required?: boolean;
  description: string;
}

export interface RouteEntry {
  method: HttpMethod;
  path: string;
  description: string;
  category: string;
  parameters?: Record<string, RouteParam>;
  /** Present only for entries that carry full Glean-level response detail (report today). */
  responses?: Record<string, unknown>;
  /**
   * Keys (into API_REGISTRY) of sibling routes worth exploring next. Present
   * only on routes that emit `meta`. Typed as `readonly string[]` rather than
   * `RouteKey[]` to avoid a circular type (RouteKey is derived from
   * `typeof API_REGISTRY`, which is built from RouteEntry) — apiRegistry.test.ts
   * verifies every value here is actually a valid registry key at runtime.
   */
  related?: readonly string[];
}

/**
 * Single source of truth for GET /api/v1/schema and every response's
 * `meta.related` list. Every mounted API route lives here (including ones
 * that never attach `meta` to their own response), so /api/v1/schema stays
 * a complete directory. Keep this in sync with CLAUDE.md's "API Routes" table.
 *
 * /agent/* (HTML browsing surface) and /cache-healthcheck (VIP-only liveness
 * probe) are intentionally excluded — they aren't part of the documented API.
 */
export const API_REGISTRY = {
  // --- system -------------------------------------------------------------
  'health.healthz': {
    method: 'GET',
    path: '/healthz',
    description: 'Liveness check.',
    category: 'system',
  },
  'health.legacy': {
    method: 'GET',
    path: '/api/v1/health',
    description: 'Legacy liveness check with version info. Kept for existing clients.',
    category: 'system',
  },
  'schema.get': {
    method: 'GET',
    path: '/api/v1/schema',
    description: 'This endpoint. Machine-readable directory of every route in this API.',
    category: 'system',
  },
  'settings.get': {
    method: 'GET',
    path: '/api/v1/settings',
    description: 'Read the current key/value runtime settings (API keys, scheduler config).',
    category: 'system',
  },
  'settings.put': {
    method: 'PUT',
    path: '/api/v1/settings/:key',
    description: 'Update a single runtime setting by key.',
    category: 'system',
  },

  // --- sites ----------------------------------------------------------------
  'sites.list': {
    method: 'GET',
    path: '/api/v1/sites',
    description: 'Paginated, filterable, sortable list of scanned federal sites.',
    category: 'sites',
    parameters: {
      page: { type: 'number', description: 'Page number, default 1.' },
      limit: { type: 'number', description: 'Page size, default 25, max 5000.' },
      sort: { type: 'string', description: 'Sortable column, e.g. domain, agency, live, uswds_count.' },
      order: { type: 'string', description: "'asc' or 'desc'." },
      search: { type: 'string', description: 'Free-text match across domain/agency/bureau/title/city/state.' },
      agency: { type: 'string', description: 'Exact agency name filter.' },
      bureau: { type: 'string', description: 'Exact bureau name filter.' },
      public_only: { type: 'boolean', description: 'Restrict to publicly reachable sites.' },
    },
    related: ['sites.detail', 'sites.domainTypes', 'stats.get', 'report.get'],
  },
  'sites.domainTypes': {
    method: 'GET',
    path: '/api/v1/sites/domain-types',
    description: 'Distinct branch/domain-type values present in the sites table.',
    category: 'sites',
    related: ['sites.list'],
  },
  'sites.detail': {
    method: 'GET',
    path: '/api/v1/sites/:domain',
    description: 'A single site plus its scan history, briefings, and any domains that redirect into it.',
    category: 'sites',
    related: ['sites.list', 'briefings.list', 'scans.history', 'report.get'],
  },
  'sites.update': {
    method: 'PUT',
    path: '/api/v1/sites/:domain',
    description: 'Manually edit fields on a single site row.',
    category: 'sites',
  },

  // --- stats ------------------------------------------------------------
  'stats.get': {
    method: 'GET',
    path: '/api/v1/stats',
    description: 'Aggregate analytics — USWDS/DAP/HTTPS adoption, CMS breakdown, agency/bureau rollups.',
    category: 'stats',
    parameters: {
      agency: { type: 'string', description: 'Restrict aggregates to one agency.' },
      bureau: { type: 'string', description: 'Restrict aggregates to one bureau.' },
      domains: { type: 'string', description: 'Comma-separated list of domains to restrict to.' },
    },
    related: ['sites.list', 'report.get', 'agencies.list', 'bureaus.list'],
  },
  'stats.summarize': {
    method: 'POST',
    path: '/api/v1/stats/summarize',
    description: 'Removed — AI stats summarization has been retired. Returns 501.',
    category: 'stats',
  },

  // --- query --------------------------------------------------------------
  'query.run': {
    method: 'POST',
    path: '/api/v1/query',
    description: 'Run a raw, SELECT-only SQL query against the sites database. Rate-limited.',
    category: 'query',
    parameters: {
      sql: { type: 'string', required: true, description: 'A single SELECT statement.' },
    },
    related: ['sites.list', 'stats.get'],
  },

  // --- scans ----------------------------------------------------------------
  'scans.history': {
    method: 'GET',
    path: '/api/v1/scans/:domain',
    description: 'Recent scan history for one domain.',
    category: 'scans',
  },
  'scans.create': {
    method: 'POST',
    path: '/api/v1/scans',
    description: 'Store a scan result and auto-apply detected fields to the sites table.',
    category: 'scans',
  },

  // --- proxy ------------------------------------------------------------
  'proxy.fetch': {
    method: 'POST',
    path: '/api/v1/proxy',
    description: 'SSRF-protected outbound GET/HEAD proxy, used by the browser-side scanner to bypass CORS.',
    category: 'proxy',
  },

  // --- gsa / getgov imports -------------------------------------------------
  'gsa.import': {
    method: 'POST',
    path: '/api/v1/gsa/import',
    description: 'Stream an import from the GSA federal site-scanning API (ndjson progress events).',
    category: 'import',
  },
  'gsa.fetch': {
    method: 'GET',
    path: '/api/v1/gsa/fetch',
    description: 'Pass-through fetch of raw GSA API data, for inspection.',
    category: 'import',
  },
  'gsa.test': {
    method: 'GET',
    path: '/api/v1/gsa/test',
    description: 'Check whether the configured GSA API key can connect.',
    category: 'import',
  },
  'getgov.import': {
    method: 'POST',
    path: '/api/v1/getgov/import',
    description: 'Stream an import from the get.gov domain registration dataset (ndjson progress events).',
    category: 'import',
  },
  'getgov.test': {
    method: 'GET',
    path: '/api/v1/getgov/test',
    description: 'Check whether the get.gov registry endpoint is reachable.',
    category: 'import',
  },

  // --- briefings --------------------------------------------------------
  'briefings.list': {
    method: 'GET',
    path: '/api/v1/briefings/:domain',
    description: 'Stored briefings for one domain.',
    category: 'briefings',
    related: ['sites.detail', 'briefings.export'],
  },
  'briefings.export': {
    method: 'GET',
    path: '/api/v1/briefings/export/:id',
    description: 'Download one briefing as a Markdown file.',
    category: 'briefings',
  },
  'briefings.create': {
    method: 'POST',
    path: '/api/v1/briefings',
    description: 'Removed — AI briefing generation has been retired. Returns 501.',
    category: 'briefings',
  },

  // --- scan sessions ------------------------------------------------------
  'scanSessions.list': {
    method: 'GET',
    path: '/api/v1/scan-sessions',
    description: 'Recent bulk-scan sessions and their progress.',
    category: 'scan-sessions',
    related: ['scheduler.status', 'sites.list'],
  },
  'scanSessions.create': {
    method: 'POST',
    path: '/api/v1/scan-sessions',
    description: 'Start tracking a new bulk-scan session.',
    category: 'scan-sessions',
  },
  'scanSessions.update': {
    method: 'PATCH',
    path: '/api/v1/scan-sessions/:id',
    description: 'Update progress or finalize a bulk-scan session.',
    category: 'scan-sessions',
  },

  // --- agencies / bureaus -------------------------------------------------
  'agencies.resolve': {
    method: 'GET',
    path: '/api/v1/agencies/resolve',
    description: 'Resolve an acronym or nickname (e.g. "HHS") to its canonical agency name.',
    category: 'agencies',
    parameters: {
      q: { type: 'string', required: true, description: 'Acronym, nickname, or partial agency name.' },
    },
    related: ['agencies.list', 'bureaus.list', 'report.get'],
  },
  'agencies.list': {
    method: 'GET',
    path: '/api/v1/agencies',
    description: 'Agency names present in the sites table, with site counts.',
    category: 'agencies',
    parameters: {
      q: { type: 'string', description: 'Optional prefix/substring filter.' },
    },
    related: ['bureaus.list', 'agencies.resolve', 'report.get'],
  },
  'bureaus.list': {
    method: 'GET',
    path: '/api/v1/bureaus',
    description: 'Bureau names present in the sites table, with site counts.',
    category: 'agencies',
    parameters: {
      q: { type: 'string', description: 'Optional prefix/substring filter.' },
      agency: { type: 'string', description: 'Restrict to bureaus under one agency.' },
    },
    related: ['agencies.list', 'agencies.resolve', 'report.get'],
  },

  // --- report -------------------------------------------------------------
  'report.get': {
    method: 'GET',
    path: '/api/v1/report',
    description:
      'Resolve an agency or bureau name (exact or shorthand) and return its public website data. ' +
      'Returns disambiguation candidates when the query is ambiguous.',
    category: 'report',
    parameters: {
      q: {
        type: 'string',
        required: true,
        description:
          "Agency or bureau name, exact or partial (e.g. 'HHS', 'NOAA', 'Centers for Medicare and Medicaid Services')",
      },
    },
    responses: {
      '200_resolved': {
        needs_disambiguation: false,
        matched_as: "'agency' | 'bureau'",
        matched_name: 'string — canonical name as stored in the database',
        parent_agency: 'string | null — populated when matched_as is bureau',
        total_public_sites: 'number',
        summary: {
          total_public_sites: 'number',
          live_count: 'number — sites returning HTTP 200',
          uswds_count: 'number — sites with U.S. Web Design System detected',
          dap_count: 'number — sites with Digital Analytics Program tag',
          https_enforced_count: 'number — sites enforcing HTTPS',
          sitemap_detected_count: 'number — sites with sitemap.xml',
        },
        sites: [
          {
            domain: 'string',
            url: 'string | null',
            title: 'string | null',
            description: 'string | null',
            cms: 'string | null — detected content management system',
            uswds_count: 'number | null — USWDS signal count (higher = more confident)',
            uswds_version: 'number | null',
            uswds_semantic_version: 'string | null',
            dap: '0 | 1 | null',
            dap_version: 'string | null',
            https_enforced: '0 | 1 | null',
            sitemap_xml_detected: '0 | 1 | null',
            security_header_csp: 'string | null — Content-Security-Policy header value',
            updated_at: 'string — ISO 8601 timestamp of last scan',
          },
        ],
      },
      '200_disambiguation': {
        needs_disambiguation: true,
        query: 'string',
        candidates: [
          {
            type: "'agency' | 'bureau'",
            name: 'string',
            parent_agency: 'string | null',
            site_count: 'number',
            score: 'number',
          },
        ],
      },
      '400': { error: 'string — validation message' },
      '404': { error: 'string', query: 'string' },
      '500': { error: 'string' },
    },
    related: ['agencies.resolve', 'sites.list', 'stats.get', 'briefings.list'],
  },

  // --- scheduler ----------------------------------------------------------
  'scheduler.status': {
    method: 'GET',
    path: '/api/v1/scheduler/status',
    description: 'Current config and last-run status for the GSA/rescan/get.gov cron jobs.',
    category: 'scheduler',
    related: ['scanSessions.list', 'gsa.import', 'getgov.import'],
  },
  'scheduler.putGsa': {
    method: 'PUT',
    path: '/api/v1/scheduler/gsa',
    description: 'Update the GSA refresh job schedule.',
    category: 'scheduler',
  },
  'scheduler.putScan': {
    method: 'PUT',
    path: '/api/v1/scheduler/scan',
    description: 'Update the site rescan job schedule.',
    category: 'scheduler',
  },
  'scheduler.putGetgov': {
    method: 'PUT',
    path: '/api/v1/scheduler/getgov',
    description: 'Update the get.gov refresh job schedule.',
    category: 'scheduler',
  },
  'scheduler.runGsa': {
    method: 'POST',
    path: '/api/v1/scheduler/gsa/run',
    description: 'Trigger a GSA refresh immediately.',
    category: 'scheduler',
  },
  'scheduler.runScan': {
    method: 'POST',
    path: '/api/v1/scheduler/scan/run',
    description: 'Trigger a site rescan immediately.',
    category: 'scheduler',
  },
  'scheduler.stopScan': {
    method: 'POST',
    path: '/api/v1/scheduler/scan/stop',
    description: 'Request the running rescan to stop after the current batch.',
    category: 'scheduler',
  },
  'scheduler.runGetgov': {
    method: 'POST',
    path: '/api/v1/scheduler/getgov/run',
    description: 'Trigger a get.gov refresh immediately.',
    category: 'scheduler',
  },

  // --- chat -----------------------------------------------------------------
  'chat.send': {
    method: 'POST',
    path: '/api/v1/chat',
    description: 'Ask Claude a question over the site data; it answers via tool-use over this REST API.',
    category: 'chat',
  },
  'models.list': {
    method: 'GET',
    path: '/api/v1/models',
    description: 'Claude models the configured ANTHROPIC_API_KEY can access.',
    category: 'chat',
    related: ['chat.send'],
  },
} as const satisfies Record<string, RouteEntry>;

export type RouteKey = keyof typeof API_REGISTRY;

const REGISTRY_BY_KEY = API_REGISTRY as Record<string, RouteEntry>;

/** Looks up a registry entry by key. Accepts a plain `string` so callers can pass a `related` entry. */
export function getRouteEntry(key: string): RouteEntry {
  return REGISTRY_BY_KEY[key];
}

function refFor(key: string) {
  const entry = getRouteEntry(key);
  return { method: entry.method, path: entry.path, description: entry.description };
}

/**
 * Builds the GET /api/v1/schema response. Every registry entry becomes a
 * `"METHOD /path"` key with its description, parameters (if any), a static
 * `related` list of sibling endpoints (if any), and — for report.get only —
 * the full hand-authored response schema historically used by Glean's tool
 * definitions.
 */
export function buildSchemaResponse() {
  const endpoints: Record<string, unknown> = {};
  for (const key of Object.keys(API_REGISTRY)) {
    const entry = getRouteEntry(key);
    const routeKey = `${entry.method} ${entry.path}`;
    endpoints[routeKey] = {
      description: entry.description,
      ...(entry.parameters ? { parameters: entry.parameters } : {}),
      ...(entry.responses ? { responses: entry.responses } : {}),
      ...(entry.related ? { related: entry.related.map((k) => `${refFor(k).method} ${refFor(k).path} — ${refFor(k).description}`) } : {}),
    };
  }

  return {
    info: {
      title: 'Site Scan Analyzer API',
      description:
        'Federal government website scan data. Use /api/v1/report to retrieve public website data for any agency or bureau by name.',
      version: readPackageVersion(),
    },
    meta_convention:
      'GET/list/detail and query-style endpoints include a `meta.related` array of sibling endpoints you can ' +
      'call next from this same data family. That list is static per route, not derived from the specific ' +
      'response payload.',
    endpoints,
  };
}
