import { Router } from 'express';
import type { Request, Response } from 'express';
import { query } from '../db';
import { PUBLIC_ONLY_CONDITION } from '../utils/publicFilter';
import { buildColumnFilters } from '../utils/columnFilters';
import { simplify } from '../utils/simplify';
import { parsedArray, INTEGER_FIELDS, ARRAY_FIELDS, INTERNAL_FETCH_FIELDS, normalizeSite } from '../utils/normalizeSite';

const router = Router();

// Replacer for JSON.stringify that strips control characters (U+0000–U+001F,
// U+007F) from string values. Scraped web data frequently contains these, and
// while JSON.stringify escapes them, many strict parsers (including some LLM
// tool runtimes) reject them outright.
function controlCharReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/[\x00-\x1F\x7F]/g, '');
  }
  return value;
}

function sendJson(res: Response, body: unknown): void {
  res.type('json').send(JSON.stringify(body, controlCharReplacer));
}

const MAX_SITES = 500;
const DEFAULT_PAGE_SIZE = 50;
const DISAMBIGUATION_RATIO_THRESHOLD = 1.5;

// ---------------------------------------------------------------------------
// Field presets and allowlist
// ---------------------------------------------------------------------------

const AGENT_DEFAULT_FIELDS: string[] = [
  'domain', 'name', 'title', 'description', 'agency', 'bureau', 'language', 'media_type',
  'pageviews', 'dap', 'dap_parameters', 'dap_version', 'analytics_platforms',
  'cms', 'wp_version', 'wp_theme', 'wp_plugins', 'wp_post_count', 'wp_page_count',
  'wp_author_count', 'wp_media_total', 'wp_media_size_formatted', 'wp_feeds',
  'wp_custom_post_types', 'sitemap_xml_detected',
  'hosting_provider', 'web_server', 'cdn_provider', 'https_enforced', 'hsts',
  'third_party_service_count', 'third_party_service_domains',
  'detected_technologies', 'login_provider', 'robots_txt_detected',
  'uswds_count', 'uswds_semantic_version', 'required_links_url',
  'required_links_text', 'cumulative_layout_shift', 'largest_contentful_paint',
];

// All columns requestable via ?fields=. Excludes internal/operational columns.
const REPORT_FIELD_ALLOWLIST = new Set([
  // Core identification
  'domain', 'name', 'url', 'base_domain', 'initial_url', 'initial_domain',
  'initial_base_domain', 'initial_top_level_domain', 'top_level_domain',
  // Status
  'redirect', 'live', 'status_code', 'media_type', 'scan_date', 'test_404',
  // Organization
  'agency', 'bureau', 'branch',
  // Analytics
  'pageviews', 'dap', 'dap_parameters', 'dap_version', 'ga_tag_id', 'search_dot_gov',
  // Technical
  'ipv6', 'hostname', 'cms', 'login_provider', 'site_search', 'viewport_meta_tag',
  'main_element_present', 'language', 'language_link',
  'cumulative_layout_shift', 'largest_contentful_paint',
  // Metadata / SEO
  'title', 'description', 'keywords', 'og_title', 'og_description', 'og_image',
  'og_article_published', 'og_article_modified', 'og_type', 'og_url', 'canonical_link',
  'required_links_url', 'required_links_text',
  // Third-party services
  'third_party_service_count', 'third_party_service_domains', 'third_party_service_urls',
  'cookie_domains', 'source_list',
  // Robots.txt
  'robots_txt_detected', 'robots_txt_url', 'robots_txt_status_code', 'robots_txt_media_type',
  'robots_txt_filesize', 'robots_txt_crawl_delay', 'robots_txt_sitemap_locations',
  // Sitemap
  'sitemap_xml_detected', 'sitemap_xml_url', 'sitemap_xml_status_code', 'sitemap_xml_media_type',
  'sitemap_xml_filesize', 'sitemap_xml_count', 'sitemap_xml_lastmod', 'sitemap_xml_pdf_count',
  // USWDS
  'uswds_favicon', 'uswds_favicon_in_css', 'uswds_publicsans_font', 'uswds_inpage_css',
  'uswds_string', 'uswds_string_in_css', 'uswds_version', 'uswds_count', 'uswds_usa_classes',
  'uswds_usa_class_list', 'uswds_banner_heres_how', 'uswds_semantic_version',
  // Security
  'https_enforced', 'hsts', 'security_header_csp', 'security_header_xss',
  // WWW check
  'www_url', 'www_status_code', 'www_title',
  // Timestamps
  'imported_at', 'updated_at',
  // initDb-added scanner columns
  'analytics_platforms', 'hosting_provider', 'web_server', 'cdn_provider', 'content_type',
  'source_code_url', 'contact_email_address',
  'wp_version', 'wp_theme', 'wp_theme_version', 'wp_plugins', 'wp_plugins_detailed',
  'wp_post_count', 'wp_page_count', 'wp_author_count', 'wp_media_total',
  'wp_media_size_formatted', 'wp_feeds', 'wp_custom_post_types',
  'detected_technologies',
]);

interface AgencyCandidate {
  name: string;
  site_count: number;
  score: number;
}

interface BureauCandidate {
  name: string;
  parent_agency: string;
  site_count: number;
  score: number;
}

interface Candidate {
  type: 'agency' | 'bureau';
  name: string;
  parent_agency: string | null;
  site_count: number;
  score: number;
}

interface ReportSummary {
  total_public_sites: number;
  live_count: number;
  uswds_count: number;
  dap_count: number;
  https_enforced_count: number;
  sitemap_detected_count: number;
}

interface SiteError {
  domain: string;
  reason: 'scan_failed' | 'stale_data' | 'unreachable' | 'redirect_loop';
  last_scanned?: string;
}

const STALE_DAYS = 90;

// ---------------------------------------------------------------------------
// Error detection — runs on raw (pre-normalize) rows
// ---------------------------------------------------------------------------

function buildErrors(rows: Record<string, unknown>[]): SiteError[] {
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - STALE_DAYS);

  const errors: SiteError[] = [];
  for (const row of rows) {
    const domain = String(row.domain ?? '');
    if (row.live === 0) {
      errors.push({ domain, reason: 'unreachable' });
    } else if (row.redirect === 1) {
      errors.push({ domain, reason: 'redirect_loop' });
    } else if (row.primary_scan_status && row.primary_scan_status !== 'completed') {
      errors.push({ domain, reason: 'scan_failed' });
    } else if (row.updated_at) {
      const updatedAt = new Date(row.updated_at as string);
      if (!isNaN(updatedAt.getTime()) && updatedAt < staleThreshold) {
        errors.push({ domain, reason: 'stale_data', last_scanned: row.updated_at as string });
      }
    }
  }
  return errors;
}

async function scoreCandidates(q: string): Promise<{ agencies: AgencyCandidate[]; bureaus: BureauCandidate[] }> {
  const params = { q, q_prefix: `${q}%`, q_contains: `%${q}%` };

  const [agencyRows, bureauRows] = await Promise.all([
    query<{ name: string; site_count: string; score: string }>(`
      SELECT
        agency AS name,
        COUNT(*) AS site_count,
        (CASE
          WHEN LOWER(agency) = LOWER(:q)  THEN 3
          WHEN agency LIKE :q_prefix      THEN 2
          ELSE 1
        END * COUNT(*)) AS score
      FROM sites
      WHERE agency IS NOT NULL AND agency LIKE :q_contains
      GROUP BY agency
      ORDER BY score DESC
      LIMIT 5
    `, params),
    query<{ name: string; parent_agency: string; site_count: string; score: string }>(`
      SELECT
        bureau AS name,
        agency AS parent_agency,
        COUNT(*) AS site_count,
        (CASE
          WHEN LOWER(bureau) = LOWER(:q)  THEN 3
          WHEN bureau LIKE :q_prefix      THEN 2
          ELSE 1
        END * COUNT(*)) AS score
      FROM sites
      WHERE bureau IS NOT NULL AND bureau LIKE :q_contains
      GROUP BY bureau, agency
      ORDER BY score DESC
      LIMIT 5
    `, params),
  ]);

  return {
    agencies: agencyRows.map(r => ({ name: r.name, site_count: Number(r.site_count), score: Number(r.score) })),
    bureaus: bureauRows.map(r => ({ name: r.name, parent_agency: r.parent_agency, site_count: Number(r.site_count), score: Number(r.score) })),
  };
}

function pickBestMatch(candidates: { agencies: AgencyCandidate[]; bureaus: BureauCandidate[] }):
  | { ambiguous: false; type: 'agency' | 'bureau'; name: string; parent_agency: string | null }
  | { ambiguous: true; candidates: Candidate[] } {
  const topAgency = candidates.agencies[0] ?? null;
  const topBureau = candidates.bureaus[0] ?? null;

  if (!topAgency && !topBureau) {
    return { ambiguous: false, type: 'agency', name: '', parent_agency: null };
  }
  if (topAgency && !topBureau) {
    return { ambiguous: false, type: 'agency', name: topAgency.name, parent_agency: null };
  }
  if (topBureau && !topAgency) {
    return { ambiguous: false, type: 'bureau', name: topBureau.name, parent_agency: topBureau.parent_agency };
  }

  const aScore = topAgency!.score;
  const bScore = topBureau!.score;
  const ratio = Math.max(aScore, bScore) / Math.min(aScore, bScore);

  if (ratio >= DISAMBIGUATION_RATIO_THRESHOLD) {
    return aScore >= bScore
      ? { ambiguous: false, type: 'agency', name: topAgency!.name, parent_agency: null }
      : { ambiguous: false, type: 'bureau', name: topBureau!.name, parent_agency: topBureau!.parent_agency };
  }

  const allCandidates: Candidate[] = [
    ...candidates.agencies.slice(0, 3).map(a => ({ type: 'agency' as const, name: a.name, parent_agency: null, site_count: a.site_count, score: a.score })),
    ...candidates.bureaus.slice(0, 3).map(b => ({ type: 'bureau' as const, name: b.name, parent_agency: b.parent_agency, site_count: b.site_count, score: b.score })),
  ];
  allCandidates.sort((a, b) => b.score - a.score);

  return { ambiguous: true, candidates: allCandidates };
}

router.get('/', async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim();

  if (!q) {
    res.status(400).json({ error: 'q parameter is required' });
    return;
  }
  if (q.length > 200) {
    res.status(400).json({ error: 'q parameter must be 200 characters or fewer' });
    return;
  }

  try {
    const candidates = await scoreCandidates(q);

    if (!candidates.agencies.length && !candidates.bureaus.length) {
      res.status(404).json({ error: 'No agency or bureau found matching the query', query: q });
      return;
    }

    const decision = pickBestMatch(candidates);

    if (decision.ambiguous) {
      sendJson(res, { needs_disambiguation: true, query: q, candidates: decision.candidates });
      return;
    }

    const { type, name, parent_agency } = decision;

    if (!name) {
      res.status(404).json({ error: 'No agency or bureau found matching the query', query: q });
      return;
    }

    const limit  = Math.min(MAX_SITES, Math.max(1, parseInt(req.query.limit as string || String(DEFAULT_PAGE_SIZE))));
    const page   = Math.max(1, parseInt(req.query.page as string || '1'));
    const offset = (page - 1) * limit;

    const siteParams: Record<string, unknown> = { name };
    const entityCondition = type === 'agency'
      ? 'agency = :name'
      : 'bureau = :name AND agency = :parent_agency';

    if (type === 'bureau') {
      siteParams.parent_agency = parent_agency;
    }

    // ?cms= filter (case-insensitive; 'none'/'unspecified' → NULL/empty)
    const cmsFilter = ((req.query.cms as string) || '').trim();
    let filtered = false;
    const extraFilters: string[] = [];
    if (cmsFilter) {
      filtered = true;
      if (cmsFilter === 'none' || cmsFilter === 'unspecified') {
        extraFilters.push("(cms IS NULL OR cms = '')");
      } else {
        extraFilters.push('cms LIKE :cms_filter');
        siteParams.cms_filter = `%${cmsFilter}%`;
      }
    }

    const { conditions: cfConditions, params: cfParams } = buildColumnFilters(req);
    Object.assign(siteParams, cfParams);
    const allExtra = [...extraFilters, ...cfConditions];
    const extraConditions = allExtra.length ? `AND ${allExtra.join(' AND ')}` : '';

    const fullWhere = `WHERE ${entityCondition} AND ${PUBLIC_ONLY_CONDITION} ${extraConditions}`;

    // Field selection
    const fieldsParam = ((req.query.fields as string) || '').trim();
    let selectAll = false;
    let applySimplify = false;
    let requestedFields: string[];

    if (!fieldsParam || fieldsParam === 'agent_default') {
      requestedFields = AGENT_DEFAULT_FIELDS;
    } else if (fieldsParam === 'all') {
      selectAll = true;
      requestedFields = [];
    } else if (fieldsParam === 'simplified') {
      selectAll = true;
      applySimplify = true;
      requestedFields = [];
    } else {
      const parsed = fieldsParam.split(',').map(f => f.trim()).filter(Boolean);
      requestedFields = parsed.filter(f => REPORT_FIELD_ALLOWLIST.has(f));
      if (!requestedFields.includes('domain')) requestedFields.unshift('domain');
    }

    // Always fetch internal fields for error detection and wp_plugins processing.
    // They are stripped from the output unless explicitly requested.
    const outputFieldSet = selectAll ? null : new Set(requestedFields);
    let selectCols: string;
    if (selectAll) {
      selectCols = '*';
    } else {
      const fetchFields = new Set([
        ...requestedFields,
        ...INTERNAL_FETCH_FIELDS,
        // wp_plugins_detailed needed to build structured wp_plugins output
        ...(requestedFields.includes('wp_plugins') ? ['wp_plugins_detailed'] : []),
      ]);
      selectCols = [...fetchFields].map(f => `\`${f}\``).join(', ');
    }

    const [siteRows, statsRows] = await Promise.all([
      query<Record<string, unknown>>(`
        SELECT ${selectCols}
        FROM sites
        ${fullWhere}
        ORDER BY domain ASC
        LIMIT :limit OFFSET :offset
      `, { ...siteParams, limit, offset }),
      query<{
        total_public_sites: string;
        live_count: string;
        uswds_count: string;
        dap_count: string;
        https_enforced_count: string;
        sitemap_detected_count: string;
      }>(`
        SELECT
          COUNT(*)                                                    AS total_public_sites,
          SUM(CASE WHEN live = 1 THEN 1 ELSE 0 END)                 AS live_count,
          SUM(CASE WHEN uswds_count > 0 THEN 1 ELSE 0 END)          AS uswds_count,
          SUM(CASE WHEN dap = 1 THEN 1 ELSE 0 END)                  AS dap_count,
          SUM(CASE WHEN https_enforced = 1 THEN 1 ELSE 0 END)       AS https_enforced_count,
          SUM(CASE WHEN sitemap_xml_detected = 1 THEN 1 ELSE 0 END) AS sitemap_detected_count
        FROM sites
        ${fullWhere}
      `, siteParams),
    ]);

    const stats = statsRows[0];
    const totalPublicSites = Number(stats?.total_public_sites ?? 0);

    const summary: ReportSummary = {
      total_public_sites: totalPublicSites,
      live_count: Number(stats?.live_count ?? 0),
      uswds_count: Number(stats?.uswds_count ?? 0),
      dap_count: Number(stats?.dap_count ?? 0),
      https_enforced_count: Number(stats?.https_enforced_count ?? 0),
      sitemap_detected_count: Number(stats?.sitemap_detected_count ?? 0),
    };

    // Error detection runs on raw rows before any transformation
    const errors = buildErrors(siteRows);

    let sites: Record<string, unknown>[];
    let simplifiedMeta: { global_null: string; global_redundant: Record<string, unknown> } | undefined;

    if (applySimplify) {
      const { rows, global_null, global_redundant } = simplify(siteRows);
      sites = rows.map(row => normalizeSite(row, null));
      simplifiedMeta = { global_null: global_null.join(','), global_redundant };
    } else {
      sites = siteRows.map(row => normalizeSite(row, outputFieldSet));
    }

    res.set('Cache-Control', 'no-store');
    sendJson(res, {
      needs_disambiguation: false,
      matched_as: type,
      matched_name: name,
      parent_agency: parent_agency ?? null,
      total_public_sites: totalPublicSites,
      page,
      limit,
      pages: Math.ceil(totalPublicSites / limit),
      filtered,
      ...(errors.length ? { errors } : {}),
      ...(simplifiedMeta ? { simplified: simplifiedMeta } : {}),
      summary,
      sites,
    });
  } catch (err: any) {
    console.error('[report] GET / error:', err.message, '\n', err.stack);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
