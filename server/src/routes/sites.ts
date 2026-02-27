import { Router, Request, Response } from 'express';
import { query, execute } from '../db';

const router = Router();

// GET /api/v1/sites - paginated list with filter/sort
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string || '1'));
  const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit as string || '25')));
  const offset = (page - 1) * limit;
  const sort = req.query.sort as string || 'domain';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const search = req.query.search as string || '';

  // Whitelist sortable columns to prevent injection
  const SORTABLE = new Set([
    'domain', 'agency', 'bureau', 'live', 'status_code', 'uswds_count',
    'dap', 'pageviews', 'sitemap_xml_detected', 'https_enforced', 'scan_date',
    'sitemap_xml_count', 'robots_txt_detected', 'imported_at', 'updated_at',
    'cms', 'title',
  ]);
  const safeSort = SORTABLE.has(sort) ? sort : 'domain';

  // Build filter clauses
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (search) {
    // ILIKE for case-insensitive search in PostgreSQL
    conditions.push('(domain ILIKE :search OR agency ILIKE :search OR bureau ILIKE :search OR title ILIKE :search)');
    params.search = `%${search}%`;
  }

  // Quick filter chips
  if (req.query.live === 'true') conditions.push('live = 1');
  if (req.query.live === 'false') conditions.push('live = 0');
  if (req.query.has_uswds === 'true') conditions.push('uswds_count > 0');
  if (req.query.no_sitemap === 'true') conditions.push('sitemap_xml_detected = 0');
  if (req.query.has_dap === 'true') conditions.push('dap = 1');
  if (req.query.https_enforced === 'true') conditions.push('https_enforced = 1');
  if (req.query.has_login === 'true') conditions.push('login_provider IS NOT NULL');
  if (req.query.agency) {
    conditions.push('agency = :agency');
    params.agency = req.query.agency;
  }
  if (req.query.bureau) {
    conditions.push('bureau = :bureau');
    params.bureau = req.query.bureau;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // pg returns COUNT(*) as a string — cast to Number
  const countRows = await query<{ count: string }>(`SELECT COUNT(*) as count FROM sites ${where}`, params);
  const total = Number(countRows[0].count);

  const rows = await query(
    `SELECT * FROM sites ${where} ORDER BY ${safeSort} ${order} LIMIT :limit OFFSET :offset`,
    { ...params, limit, offset }
  );

  res.json({
    data: rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
});

// GET /api/v1/sites/:domain - single site with scan history
router.get('/:domain', async (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const site = (await query('SELECT * FROM sites WHERE domain = $1', [domain]))[0];

  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  const scanHistory = await query(
    'SELECT * FROM scan_history WHERE domain = $1 ORDER BY scanned_at DESC LIMIT 20',
    [domain]
  );

  const briefings = await query(
    'SELECT id, domain, created_at, provider, model, full_markdown FROM briefings WHERE domain = $1 ORDER BY created_at DESC LIMIT 5',
    [domain]
  );

  res.json({ site, scan_history: scanHistory, briefings });
});

// PUT /api/v1/sites/:domain - update site record
router.put('/:domain', async (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const updates = req.body as Record<string, unknown>;

  const existing = (await query('SELECT domain FROM sites WHERE domain = $1', [domain]))[0];
  if (!existing) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  // Serialize any array/object values
  const safeUpdates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (Array.isArray(v) || (v && typeof v === 'object')) {
      safeUpdates[k] = JSON.stringify(v);
    } else {
      safeUpdates[k] = v;
    }
  }
  safeUpdates.updated_at = new Date().toISOString();
  safeUpdates.domain = domain;

  const cols = Object.keys(safeUpdates).filter(k => k !== 'domain');
  const setClause = cols.map(k => `${k} = :${k}`).join(', ');

  await execute(`UPDATE sites SET ${setClause} WHERE domain = :domain`, safeUpdates);

  const updated = (await query('SELECT * FROM sites WHERE domain = $1', [domain]))[0];
  res.json(updated);
});

export default router;
