import { Router, Request, Response } from 'express';
import { sqlite } from '../db';
import { config } from '../config';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const agency = (req.query.agency as string) || '';
  const bureau = (req.query.bureau as string) || '';

  // Build a WHERE clause fragment for the optional filter
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (agency) { conditions.push('agency = ?'); bindings.push(agency); }
  if (bureau) { conditions.push('bureau = ?'); bindings.push(bureau); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const q = (sql: string) => (sqlite.prepare(sql).get(...bindings) as any);
  const qa = (sql: string, extra?: string[]) =>
    sqlite.prepare(sql).all(...bindings, ...(extra ?? [])) as any[];

  const total = q(`SELECT COUNT(*) as n FROM sites ${where}`).n;
  const live = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} live = 1`).n;
  const uswds_any = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} uswds_count > 0`).n;
  const dap_count = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} dap = 1`).n;
  const https_enforced = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} https_enforced = 1`).n;
  const sitemap_detected = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} sitemap_xml_detected = 1`).n;
  const sitemap_not_detected = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} sitemap_xml_detected = 0`).n;

  const by_agency = sqlite.prepare(
    `SELECT agency, COUNT(*) as count FROM sites WHERE agency IS NOT NULL GROUP BY agency ORDER BY count DESC`
  ).all();

  const bureauWhere = agency ? 'WHERE agency = ? AND bureau IS NOT NULL' : 'WHERE bureau IS NOT NULL';
  const by_bureau = sqlite.prepare(`
    SELECT bureau,
      COUNT(*) as count,
      ROUND(AVG(uswds_count), 1) as uswds_avg,
      ROUND(100.0 * SUM(CASE WHEN dap = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as dap_pct
    FROM sites ${bureauWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 30
  `).all(...(agency ? [agency] : []));

  // Top third-party domains using json_each — filtered by scope
  const tpWhere = conditions.length
    ? `WHERE ${conditions.map(c => `s.${c}`).join(' AND ')} AND s.third_party_service_domains IS NOT NULL`
    : 'WHERE s.third_party_service_domains IS NOT NULL';
  const top_third_party = sqlite.prepare(`
    SELECT value as domain, COUNT(DISTINCT s.domain) as site_count
    FROM sites s, json_each(s.third_party_service_domains)
    ${tpWhere}
    GROUP BY value ORDER BY site_count DESC LIMIT 15
  `).all(...bindings);

  const bureauSiteWhere = agency ? 'WHERE agency = ? AND bureau IS NOT NULL' : 'WHERE bureau IS NOT NULL';
  const by_bureau_sites = sqlite.prepare(`
    SELECT bureau, COUNT(*) as count
    FROM sites ${bureauSiteWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 10
  `).all(...(agency ? [agency] : []));

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
  const bindings: string[] = [];
  if (agency) { conditions.push('agency = ?'); bindings.push(agency); }
  if (bureau) { conditions.push('bureau = ?'); bindings.push(bureau); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const q = (sql: string) => (sqlite.prepare(sql).get(...bindings) as any);

  const total = q(`SELECT COUNT(*) as n FROM sites ${where}`).n;
  const live = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} live = 1`).n;
  const uswds = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} uswds_count > 0`).n;
  const dap = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} dap = 1`).n;
  const https_enforced = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} https_enforced = 1`).n;
  const sitemap = q(`SELECT COUNT(*) as n FROM sites ${where}${where ? ' AND' : ' WHERE'} sitemap_xml_detected = 1`).n;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

  const bureauWhere = agency ? 'WHERE agency = ? AND bureau IS NOT NULL' : 'WHERE bureau IS NOT NULL';
  const topBureaus = (sqlite.prepare(`
    SELECT bureau, COUNT(*) as count FROM sites ${bureauWhere}
    GROUP BY bureau ORDER BY count DESC LIMIT 8
  `).all(...(agency ? [agency] : [])) as any[]).map((b: any) => `${b.bureau} (${b.count})`).join(', ');

  const tpWhere = conditions.length
    ? `WHERE ${conditions.map(c => `s.${c}`).join(' AND ')} AND s.third_party_service_domains IS NOT NULL`
    : 'WHERE s.third_party_service_domains IS NOT NULL';
  const topTp = (sqlite.prepare(`
    SELECT value as domain, COUNT(DISTINCT s.domain) as site_count
    FROM sites s, json_each(s.third_party_service_domains) ${tpWhere}
    GROUP BY value ORDER BY site_count DESC LIMIT 8
  `).all(...bindings) as any[]).map((d: any) => d.domain).join(', ');

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
