import { Router, Request, Response } from 'express';
import { query } from '../db';
import { config } from '../config';

const router = Router();

// Simple in-memory rate limiter: max 10 AI summarizations per IP per 5 minutes
const summarizeRateLimitMap = new Map<string, number[]>();
const SUMMARIZE_RATE_LIMIT = 10;
const SUMMARIZE_RATE_WINDOW_MS = 5 * 60 * 1000;

function checkSummarizeRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (summarizeRateLimitMap.get(ip) ?? []).filter(t => now - t < SUMMARIZE_RATE_WINDOW_MS);
  if (timestamps.length >= SUMMARIZE_RATE_LIMIT) return false;
  timestamps.push(now);
  summarizeRateLimitMap.set(ip, timestamps);
  return true;
}

router.get('/', async (req: Request, res: Response) => {
  try {
  const agency = (req.query.agency as string) || '';
  const bureau = (req.query.bureau as string) || '';
  // Comma-separated domain list for "selection" scope reports
  const domainsParam = (req.query.domains as string) || '';
  const domainList = domainsParam ? domainsParam.split(',').map(d => d.trim()).filter(Boolean) : [];

  // Build WHERE clause — domain list takes priority over agency/bureau when both present
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (domainList.length > 0) {
    // Positional params for IN clause — handled via direct array passing below
  } else {
    if (agency) { conditions.push('agency = :agency'); params.agency = agency; }
    if (bureau) { conditions.push('bureau = :bureau'); params.bureau = bureau; }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // For domain-list queries we build SQL with a literal IN list (values escaped by mysql2)
  const domainPlaceholders = domainList.length ? `(${domainList.map(() => '?').join(',')})` : null;
  const domainWhere = domainPlaceholders ? `WHERE domain IN ${domainPlaceholders}` : null;

  // Resolve which WHERE clause + params to use for count/aggregate queries
  const effectiveWhere = domainWhere ?? where;
  const effectiveParams: any = domainWhere ? domainList : params;

  // Async COUNT helper
  const qn = async (sql: string, extraWhere = '', extraParams: any = {}) => {
    const mergedWhere = effectiveWhere
      ? `${effectiveWhere}${extraWhere ? ` AND ${extraWhere}` : ''}`
      : extraWhere ? `WHERE ${extraWhere}` : '';
    const mergedParams = domainWhere
      ? (extraWhere ? [...domainList, ...Object.values(extraParams)] : domainList)
      : { ...effectiveParams, ...extraParams };
    return Number((await query(`SELECT COUNT(*) as n FROM sites ${mergedWhere}`, mergedParams))[0]?.n ?? 0);
  };

  const total              = await qn('');
  const live               = await qn('', 'live = 1');
  const uswds_any          = await qn('', 'uswds_count > 0');
  const dap_count          = await qn('', 'dap = 1');
  const https_enforced     = await qn('', 'https_enforced = 1');
  const sitemap_detected   = await qn('', 'sitemap_xml_detected = 1');
  const sitemap_not_detected = await qn('', 'sitemap_xml_detected = 0');

  // Scan coverage — never scanned (scan_date IS NULL), stale (scan_date > 90 days ago)
  const staleDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const never_scanned = await qn('', 'scan_date IS NULL');
  const stale_count   = await qn('', `scan_date IS NOT NULL AND scan_date < '${staleDate}'`);
  const scanned_count = total - never_scanned;

  // EOL risk — simple heuristics on CMS + version fields
  const eol_risk_count = await qn('', `(
    (cms LIKE '%Drupal%' AND (wp_version LIKE '7.%' OR wp_version IS NULL))
    OR (cms LIKE '%WordPress%' AND wp_version REGEXP '^[1-5]\\\\.')
    OR cms LIKE '%SharePoint 2013%'
    OR cms LIKE '%SharePoint 2016%'
  )`);

  // Grouped aggregations — scoped to the same effective filter
  const groupWhere = effectiveWhere;
  const groupParams: any = effectiveParams;

  const by_agency = await query(
    `SELECT agency, COUNT(*) as count FROM sites WHERE agency IS NOT NULL GROUP BY agency ORDER BY count DESC`,
  );

  const bureauBaseWhere = domainWhere
    ? `${domainWhere} AND bureau IS NOT NULL`
    : agency ? 'WHERE agency = :agency AND bureau IS NOT NULL' : 'WHERE bureau IS NOT NULL';
  const bureauParams: any = domainWhere ? domainList : (agency ? { agency } : {});

  const by_bureau = await query(`
    SELECT bureau,
      COUNT(*) as count,
      ROUND(AVG(uswds_count), 1) as uswds_avg,
      ROUND((100.0 * SUM(CASE WHEN dap = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)), 1) as dap_pct
    FROM sites ${bureauBaseWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 30
  `, bureauParams);

  const by_bureau_sites = await query(`
    SELECT bureau, COUNT(*) as count
    FROM sites ${bureauBaseWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 10
  `, bureauParams);

  const by_cms = await query(`
    SELECT COALESCE(cms, '(unknown)') as cms, COUNT(*) as count
    FROM sites ${groupWhere}
    GROUP BY cms ORDER BY count DESC LIMIT 15
  `, groupParams);

  const by_uswds_version = await query(`
    SELECT COALESCE(uswds_semantic_version, '(none)') as version, COUNT(*) as count
    FROM sites ${groupWhere}
    GROUP BY uswds_semantic_version ORDER BY count DESC LIMIT 15
  `, groupParams);

  const by_branch = await query(`
    SELECT COALESCE(branch, '(unknown)') as branch, COUNT(*) as count
    FROM sites ${groupWhere}
    GROUP BY branch ORDER BY count DESC
  `, groupParams);

  // Performance: LCP buckets (Good <2.5s, Needs improvement 2.5-4s, Poor >4s)
  const lcpRows = await query<any>(`
    SELECT
      SUM(CASE WHEN CAST(largest_contentful_paint AS DECIMAL(10,3)) < 2.5 THEN 1 ELSE 0 END) as good,
      SUM(CASE WHEN CAST(largest_contentful_paint AS DECIMAL(10,3)) BETWEEN 2.5 AND 4.0 THEN 1 ELSE 0 END) as needs_improvement,
      SUM(CASE WHEN CAST(largest_contentful_paint AS DECIMAL(10,3)) > 4.0 THEN 1 ELSE 0 END) as poor,
      SUM(CASE WHEN largest_contentful_paint IS NULL OR largest_contentful_paint = '' THEN 1 ELSE 0 END) as no_data
    FROM sites ${groupWhere}
  `, groupParams);

  // CLS buckets (Good <0.1, Needs improvement 0.1-0.25, Poor >0.25)
  const clsRows = await query<any>(`
    SELECT
      SUM(CASE WHEN CAST(cumulative_layout_shift AS DECIMAL(10,4)) < 0.1 THEN 1 ELSE 0 END) as good,
      SUM(CASE WHEN CAST(cumulative_layout_shift AS DECIMAL(10,4)) BETWEEN 0.1 AND 0.25 THEN 1 ELSE 0 END) as needs_improvement,
      SUM(CASE WHEN CAST(cumulative_layout_shift AS DECIMAL(10,4)) > 0.25 THEN 1 ELSE 0 END) as poor,
      SUM(CASE WHEN cumulative_layout_shift IS NULL OR cumulative_layout_shift = '' THEN 1 ELSE 0 END) as no_data
    FROM sites ${groupWhere}
  `, groupParams);

  // Top third-party domains
  const tpBaseConditions = conditions.length ? conditions.map(c => `s.${c}`).join(' AND ') + ' AND ' : '';
  const tpDomainWhere = domainWhere ? `s.domain IN ${domainPlaceholders} AND ` : '';
  const tpParams: any = domainWhere ? domainList : params;
  const top_third_party = await query(`
    SELECT jt.elem AS domain, COUNT(DISTINCT s.domain) AS site_count
    FROM sites s, JSON_TABLE(
      s.third_party_service_domains,
      '$[*]' COLUMNS (elem VARCHAR(500) PATH '$')
    ) AS jt
    WHERE ${tpDomainWhere}${tpBaseConditions}s.third_party_service_domains IS NOT NULL
      AND JSON_VALID(s.third_party_service_domains)
    GROUP BY jt.elem ORDER BY site_count DESC LIMIT 15
  `, tpParams);

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
  const lcp = lcpRows[0] ?? { good: 0, needs_improvement: 0, poor: 0, no_data: total };
  const cls = clsRows[0] ?? { good: 0, needs_improvement: 0, poor: 0, no_data: total };

  res.set('Cache-Control', 'private, max-age=300');
  res.json({
    filter: { agency, bureau, domains: domainList.length || undefined },
    total_sites: total,
    live_count: live,
    live_pct: pct(live),
    uswds_any_count: uswds_any,
    uswds_any_pct: pct(uswds_any),
    dap_count,
    dap_pct: pct(dap_count),
    https_enforced_count: https_enforced,
    https_enforced_pct: pct(https_enforced),
    sitemap_detected_count: sitemap_detected,
    sitemap_detected_pct: pct(sitemap_detected),
    by_agency,
    by_bureau,
    by_bureau_sites,
    top_third_party_domains: top_third_party,
    sitemap_health: {
      detected: sitemap_detected,
      not_detected: sitemap_not_detected,
      error: Math.max(0, total - sitemap_detected - sitemap_not_detected),
    },
    by_cms,
    by_uswds_version,
    by_branch,
    scan_coverage: { scanned_count, never_scanned_count: never_scanned, stale_count },
    performance_summary: {
      lcp: { good: Number(lcp.good), needs_improvement: Number(lcp.needs_improvement), poor: Number(lcp.poor), no_data: Number(lcp.no_data) },
      cls: { good: Number(cls.good), needs_improvement: Number(cls.needs_improvement), poor: Number(cls.poor), no_data: Number(cls.no_data) },
    },
    eol_risk_count: Number(eol_risk_count),
  });
  } catch (err: any) {
    console.error('[stats] GET / error:', err.message, '\n', err.stack);
    res.status(500).json({ error: err.message || 'Stats query failed' });
  }
});

/**
 * POST /api/v1/stats/summarize
 * Generates an AI narrative summary of the current dashboard stats.
 * Body: { provider: 'claude'|'glean', agency?: string, bureau?: string }
 */
router.post('/summarize', async (req: Request, res: Response) => {
  const ip = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  if (!checkSummarizeRateLimit(ip)) {
    res.status(429).json({ error: 'Too many summary requests. Please wait a few minutes before trying again.' });
    return;
  }

  const { provider = 'claude', agency = '', bureau = '' } = req.body as {
    provider?: 'claude' | 'glean';
    agency?: string;
    bureau?: string;
  };

  if (provider === 'glean' && (!config.gleanApiKey || !config.gleanEndpoint)) {
    res.status(400).json({ error: 'Glean API key and endpoint must be configured in Settings.' });
    return;
  }
  if (provider === 'claude' && !config.anthropicApiKey) {
    res.status(400).json({ error: 'Anthropic API key must be configured in Settings.' });
    return;
  }

  // Re-run stats query for the requested scope
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (agency) { conditions.push('agency = :agency'); params.agency = agency; }
  if (bureau) { conditions.push('bureau = :bureau'); params.bureau = bureau; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const qn = async (sql: string) => Number((await query(sql, params))[0]?.n ?? 0);

  const total          = await qn(`SELECT COUNT(*) as n FROM sites ${where}`);
  const live           = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} live = 1`);
  const uswds          = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} uswds_count > 0`);
  const dap            = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} dap = 1`);
  const https_enforced = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} https_enforced = 1`);
  const sitemap        = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} sitemap_xml_detected = 1`);
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

  const bureauWhere = agency ? 'WHERE agency = :agency AND bureau IS NOT NULL' : 'WHERE bureau IS NOT NULL';
  const topBureauRows = await query<any>(`
    SELECT bureau, COUNT(*) as count FROM sites ${bureauWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 8
  `, agency ? { agency } : {});
  const topBureaus = topBureauRows.map((b: any) => `${b.bureau} (${b.count})`).join(', ');

  const tpSumBaseConditions = conditions.length
    ? conditions.map(c => `s.${c}`).join(' AND ') + ' AND '
    : '';
  const topTpRows = await query<any>(`
    SELECT jt.elem AS domain, COUNT(DISTINCT s.domain) AS site_count
    FROM sites s, JSON_TABLE(
      s.third_party_service_domains,
      '$[*]' COLUMNS (elem VARCHAR(500) PATH '$')
    ) AS jt
    WHERE ${tpSumBaseConditions}s.third_party_service_domains IS NOT NULL
      AND JSON_VALID(s.third_party_service_domains)
    GROUP BY jt.elem ORDER BY site_count DESC LIMIT 8
  `, params);
  const topTp = topTpRows.map((d: any) => d.domain).join(', ');

  const scope = [agency && `Agency: ${agency}`, bureau && `Bureau: ${bureau}`].filter(Boolean).join(', ') || 'all agencies';
  const statsText = [
    `You are analyzing federal government website data from the GSA Site Scanner for ${scope}.`,
    `Total websites: ${total.toLocaleString()}.`,
    `Live sites: ${pct(live)}% (${live.toLocaleString()}).`,
    `USWDS adoption: ${pct(uswds)}% (${uswds.toLocaleString()} sites use the US Web Design System).`,
    `DAP analytics: ${pct(dap)}% (${dap.toLocaleString()} sites use the Digital Analytics Program).`,
    `HTTPS enforced: ${pct(https_enforced)}% (${https_enforced.toLocaleString()} sites).`,
    `Sitemap detected: ${pct(sitemap)}%.`,
    `Top bureaus by site count: ${topBureaus || 'N/A'}.`,
    `Top third-party domains: ${topTp || 'N/A'}.`,
    `\nWrite a concise 3-5 paragraph executive summary of these metrics, noting strengths, gaps, and actionable recommendations for improving web standards compliance. Use plain prose without bullet points.`,
  ].join(' ');

  try {
    let summary: string;

    if (provider === 'claude') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: config.anthropicApiKey });
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: statsText }],
      });
      summary = (msg.content[0] as any).text || '';
    } else {
      // Glean: POST to the endpoint with the stats as the query
      const { default: fetch } = await import('node-fetch');
      const response = await fetch(config.gleanEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.gleanApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: statsText, maxSnippetSize: 200 }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json() as any;
      summary = data?.answer?.text || data?.results?.[0]?.snippets?.[0]?.text || JSON.stringify(data);
    }

    res.json({ summary, scope, total_sites: total });
  } catch (err: any) {
    console.error('[stats] summarize error:', err.message);
    res.status(500).json({ error: 'Summary generation failed' });
  }
});

export default router;
