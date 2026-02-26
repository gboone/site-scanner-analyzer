import { Router, Request, Response } from 'express';
import { sqlite } from '../db';

export const agenciesRouter = Router();
export const bureausRouter = Router();

/**
 * GET /api/v1/agencies?q=<partial>
 * Returns up to 20 distinct agency names matching the query string (case-insensitive LIKE).
 * Returns the top agencies by site count when q is omitted or empty.
 */
agenciesRouter.get('/', (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim();

  const rows = q
    ? (sqlite.prepare(`
        SELECT agency, COUNT(*) as count FROM sites
        WHERE agency IS NOT NULL AND agency LIKE @q
        GROUP BY agency ORDER BY count DESC LIMIT 20
      `).all({ q: `%${q}%` }) as any[])
    : (sqlite.prepare(`
        SELECT agency, COUNT(*) as count FROM sites
        WHERE agency IS NOT NULL
        GROUP BY agency ORDER BY count DESC LIMIT 20
      `).all() as any[]);

  res.json(rows.map((r) => ({ value: r.agency, count: r.count })));
});

/**
 * GET /api/v1/bureaus?q=<partial>&agency=<exact>
 * Returns up to 20 distinct bureau/office names matching the query string.
 * When agency is provided the results are scoped to that agency only.
 */
bureausRouter.get('/', (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim();
  const agency = ((req.query.agency as string) || '').trim() || null;

  let rows: any[];

  if (agency) {
    rows = q
      ? (sqlite.prepare(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL AND agency = @agency AND bureau LIKE @q
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `).all({ agency, q: `%${q}%` }) as any[])
      : (sqlite.prepare(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL AND agency = @agency
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `).all({ agency }) as any[]);
  } else {
    rows = q
      ? (sqlite.prepare(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL AND bureau LIKE @q
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `).all({ q: `%${q}%` }) as any[])
      : (sqlite.prepare(`
          SELECT bureau, COUNT(*) as count FROM sites
          WHERE bureau IS NOT NULL
          GROUP BY bureau ORDER BY count DESC LIMIT 20
        `).all() as any[]);
  }

  res.json(rows.map((r) => ({ value: r.bureau, count: r.count })));
});
