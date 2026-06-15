import { Router, Request, Response } from 'express';
import { query } from '../db';
import { AGENCY_ALIASES } from '../data/agencyAliases';

export const agenciesRouter = Router();
export const bureausRouter = Router();

interface ResolveCandidate {
  agency: string;
  source: 'alias' | 'database';
  site_count: number;
}

/**
 * Count sites for an exact canonical agency name.
 */
async function countAgencySites(agency: string): Promise<number> {
  const rows = await query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sites WHERE agency = :agency',
    { agency }
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * GET /api/v1/agencies/resolve?q=<alias|partial>
 *
 * Resolves an agency acronym, nickname, or partial name to the exact agency
 * name(s) stored in the database, with site counts.
 *
 * Response shape:
 *   { query, match: { agency, source, site_count } | null,
 *     candidates: ResolveCandidate[] | null }
 *
 * - Unambiguous alias  → match populated, candidates null
 * - Ambiguous alias    → match null, candidates: [...]
 * - No alias           → DB LIKE fallback (up to 5 candidates, source 'database')
 * - Nothing found      → match null, candidates: []
 *
 * Registered BEFORE `GET /` so "resolve" never matches as a query string there.
 */
agenciesRouter.get('/resolve', async (req: Request, res: Response) => {
  const raw = ((req.query.q as string) || '').trim();
  if (!raw) {
    res.status(400).json({ error: 'q parameter is required' });
    return;
  }

  const normalized = raw.toLowerCase();
  const aliasCanonicals = AGENCY_ALIASES[normalized];

  // 1. Alias hit — count each canonical name.
  if (aliasCanonicals) {
    const candidates: ResolveCandidate[] = await Promise.all(
      aliasCanonicals.map(async (agency) => ({
        agency,
        source: 'alias' as const,
        site_count: await countAgencySites(agency),
      }))
    );

    if (candidates.length === 1) {
      res.json({ query: raw, match: candidates[0], candidates: null });
    } else {
      res.json({ query: raw, match: null, candidates });
    }
    return;
  }

  // 2. No alias — fall back to a DB LIKE search on the agency column.
  const rows = await query<{ agency: string; count: number }>(
    `SELECT agency, COUNT(*) AS count FROM sites
     WHERE agency IS NOT NULL AND agency LIKE :q
     GROUP BY agency ORDER BY count DESC LIMIT 5`,
    { q: `%${raw}%` }
  );
  const dbCandidates: ResolveCandidate[] = rows.map((r) => ({
    agency: r.agency,
    source: 'database',
    site_count: Number(r.count),
  }));

  if (dbCandidates.length === 1) {
    res.json({ query: raw, match: dbCandidates[0], candidates: null });
  } else {
    res.json({ query: raw, match: null, candidates: dbCandidates });
  }
});

/**
 * GET /api/v1/agencies?q=<partial>
 * Returns up to 20 distinct agency names matching the query string (case-insensitive LIKE).
 * Returns the top agencies by site count when q is omitted or empty.
 */
agenciesRouter.get('/', async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim();

  const rows = q
    ? await query(`
        SELECT agency, COUNT(*) as count FROM sites
        WHERE agency IS NOT NULL AND agency LIKE :q
        GROUP BY agency ORDER BY count DESC LIMIT 20
      `, { q: `%${q}%` })
    : await query(`
        SELECT agency, COUNT(*) as count FROM sites
        WHERE agency IS NOT NULL
        GROUP BY agency ORDER BY count DESC LIMIT 20
      `);

  res.json(rows.map((r: any) => ({ value: r.agency, count: r.count })));
});

/**
 * GET /api/v1/bureaus?q=<partial>&agency=<exact>
 * Returns up to 20 distinct bureau/office names matching the query string.
 * When agency is provided the results are scoped to that agency only.
 */
bureausRouter.get('/', async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim();
  const agency = ((req.query.agency as string) || '').trim() || null;

  let rows: any[];

  if (agency) {
    rows = q
      ? await query(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL AND agency = :agency AND bureau LIKE :q
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `, { agency, q: `%${q}%` })
      : await query(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL AND agency = :agency
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `, { agency });
  } else {
    rows = q
      ? await query(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL AND bureau LIKE :q
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `, { q: `%${q}%` })
      : await query(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `);
  }

  res.json(rows.map((r: any) => ({ value: r.bureau, count: r.count })));
});
