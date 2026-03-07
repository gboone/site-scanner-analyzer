import { Router } from 'express';
import type { Request, Response } from 'express';
import { query } from '../db';

const router = Router();

const MAX_SITES = 500;
const DISAMBIGUATION_RATIO_THRESHOLD = 1.5;

// Kept as a string constant (not abstracted) to stay in sync manually with sites.ts:46-64.
const PUBLIC_ONLY_CONDITION = `(redirect = 0 OR redirect IS NULL)
  AND live = 1
  AND (status_code = 200 OR status_code IS NULL)
  AND (
    title IS NULL OR title = '' OR (
      title NOT LIKE '%login%'
      AND title NOT LIKE '%log in%'
      AND title NOT LIKE '%sign in%'
      AND title NOT LIKE '%sign-in%'
      AND title NOT LIKE '%request rejected%'
      AND title NOT LIKE '%access denied%'
      AND title NOT LIKE '%unauthorized%'
      AND title NOT LIKE '%default website%'
      AND title NOT LIKE '%welcome to iis%'
      AND title NOT LIKE '%welcome to default%'
      AND title NOT LIKE '%outlook%'
      AND title NOT LIKE '%webmail%'
      AND title NOT LIKE '%forbidden%'
      AND title NOT LIKE '%it security%'
      AND title NOT LIKE '%page not found%'
    )
  )`;

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

interface ReportSite {
  domain: string;
  url: string | null;
  title: string | null;
  description: string | null;
  cms: string | null;
  uswds_count: number | null;
  uswds_version: number | null;
  uswds_semantic_version: string | null;
  dap: number | null;
  dap_version: string | null;
  https_enforced: number | null;
  sitemap_xml_detected: number | null;
  security_header_csp: string | null;
  updated_at: string;
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
      res.json({ needs_disambiguation: true, query: q, candidates: decision.candidates });
      return;
    }

    const { type, name, parent_agency } = decision;

    if (!name) {
      res.status(404).json({ error: 'No agency or bureau found matching the query', query: q });
      return;
    }

    const siteParams: Record<string, unknown> = { name };
    const entityCondition = type === 'agency'
      ? 'agency = :name'
      : 'bureau = :name AND agency = :parent_agency';

    if (type === 'bureau') {
      siteParams.parent_agency = parent_agency;
    }

    const fullWhere = `WHERE ${entityCondition} AND ${PUBLIC_ONLY_CONDITION}`;

    const [siteRows, statsRows] = await Promise.all([
      query<ReportSite>(`
        SELECT
          domain, url, title, description, cms,
          uswds_count, uswds_version, uswds_semantic_version,
          dap, dap_version, https_enforced,
          sitemap_xml_detected, security_header_csp, updated_at
        FROM sites
        ${fullWhere}
        ORDER BY domain ASC
        LIMIT ${MAX_SITES}
      `, siteParams),
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

    res.set('Cache-Control', 'private, max-age=300');
    res.json({
      needs_disambiguation: false,
      matched_as: type,
      matched_name: name,
      parent_agency: parent_agency ?? null,
      total_public_sites: totalPublicSites,
      summary,
      sites: siteRows,
    });
  } catch (err: any) {
    console.error('[report] GET / error:', err.message, '\n', err.stack);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
