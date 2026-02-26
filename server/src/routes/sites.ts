import { Router, Request, Response } from 'express';
import { sqlite } from '../db';

const router = Router();

// GET /api/v1/sites - paginated list with filter/sort
router.get('/', (req: Request, res: Response) => {
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
    conditions.push('(domain LIKE @search OR agency LIKE @search OR bureau LIKE @search OR title LIKE @search)');
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
    conditions.push('agency = @agency');
    params.agency = req.query.agency;
  }
  if (req.query.bureau) {
    conditions.push('bureau = @bureau');
    params.bureau = req.query.bureau;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = sqlite.prepare(`SELECT COUNT(*) as count FROM sites ${where}`).get(params) as { count: number };
  const total = countRow.count;

  const rows = sqlite.prepare(
    `SELECT * FROM sites ${where} ORDER BY ${safeSort} ${order} LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset });

  res.json({
    data: rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
});

// GET /api/v1/sites/:domain - single site with scan history
router.get('/:domain', (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const site = sqlite.prepare('SELECT * FROM sites WHERE domain = ?').get(domain);

  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  const scanHistory = sqlite.prepare(
    'SELECT * FROM scan_history WHERE domain = ? ORDER BY scanned_at DESC LIMIT 20'
  ).all(domain);

  const briefings = sqlite.prepare(
    'SELECT id, domain, created_at, provider, model, full_markdown FROM briefings WHERE domain = ? ORDER BY created_at DESC LIMIT 5'
  ).all(domain);

  res.json({ site, scan_history: scanHistory, briefings });
});

// PUT /api/v1/sites/:domain - update site record
router.put('/:domain', (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const updates = req.body as Record<string, unknown>;

  const existing = sqlite.prepare('SELECT domain FROM sites WHERE domain = ?').get(domain);
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
  const setClause = cols.map(k => `${k} = @${k}`).join(', ');

  sqlite.prepare(`UPDATE sites SET ${setClause} WHERE domain = @domain`).run(safeUpdates);

  const updated = sqlite.prepare('SELECT * FROM sites WHERE domain = ?').get(domain);
  res.json(updated);
});

export default router;
