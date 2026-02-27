import { Router, Request, Response } from 'express';
import { query } from '../db';
import { config } from '../config';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const agency = (req.query.agency as string) || '';
  const bureau = (req.query.bureau as string) || '';

  // Build a WHERE clause fragment for the optional filter using named params
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (agency) { conditions.push('agency = :agency'); params.agency = agency; }
  if (bureau) { conditions.push('bureau = :bureau'); params.bureau = bureau; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Async helper — COUNT(*) returns as string in PostgreSQL, cast with Number()
  const qn = async (sql: string) => Number((await query(sql, params))[0]?.n ?? 0);

  const total              = await qn(`SELECT COUNT(*) as n FROM sites ${where}`);
  const live               = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} live = 1`);
  const uswds_any          = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} uswds_count > 0`);
  const dap_count          = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} dap = 1`);
  const https_enforced     = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} https_enforced = 1`);
  const sitemap_detected   = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} sitemap_xml_detected = 1`);
  const sitemap_not_detected = await qn(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} sitemap_xml_detected = 0`);

  const by_agency = await query(
    `SELECT agency, COUNT(*) as count FROM sites WHERE agency IS NOT NULL GROUP BY agency ORDER BY count DESC`
  );

  // ROUND with two args requires NUMERIC in PostgreSQL — cast explicitly
  const bureauWhere = agency ? 'WHERE agency = :agency AND bureau IS NOT NULL' : 'WHERE bureau IS NOT NULL';
  const by_bureau = await query(`
    SELECT bureau,
      COUNT(*) as count,
      ROUND(AVG(uswds_count)::NUMERIC, 1) as uswds_avg,
      ROUND((100.0 * SUM(CASE WHEN dap = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))::NUMERIC, 1) as dap_pct
    FROM sites ${bureauWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 30
  `, agency ? { agency } : {});

  // Top third-party domains — json_each (SQLite) → jsonb_array_elements_text (PostgreSQL)
  const tpConditions = [...conditions.map(c => `s.${c}`), 's.third_party_service_domains IS NOT NULL'];
  const top_third_party = await query(`
    SELECT elem AS domain, COUNT(DISTINCT s.domain) AS site_count
    FROM sites s, jsonb_array_elements_text(s.third_party_service_domains::jsonb) AS elem
    WHERE ${tpConditions.join(' AND ')}
    GROUP BY elem ORDER BY site_count DESC LIMIT 15
  `, params);

  const bureauSiteWhere = agency ? 'WHERE agency = :agency AND bureau IS NOT NULL' : 'WHERE bureau IS NOT NULL';
  const by_bureau_sites = await query(`
    SELECT bureau, COUNT(*) as count
    FROM sites ${bureauSiteWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 10
  `, agency ? { agency } : {});

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

  res.json({
    filter: { agency, bureau },
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
  });
});

/**
 * POST /api/v1/stats/summarize
 * Generates an AI narrative summary of the current dashboard stats.
 * Body: { provider: 'claude'|'glean', agency?: string, bureau?: string }
 */
router.post('/summarize', async (req: Request, res: Response) => {
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

  const tpConditions = [...conditions.map(c => `s.${c}`), 's.third_party_service_domains IS NOT NULL'];
  const topTpRows = await query<any>(`
    SELECT elem AS domain, COUNT(DISTINCT s.domain) AS site_count
    FROM sites s, jsonb_array_elements_text(s.third_party_service_domains::jsonb) AS elem
    WHERE ${tpConditions.join(' AND ')}
    GROUP BY elem ORDER BY site_count DESC LIMIT 8
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
