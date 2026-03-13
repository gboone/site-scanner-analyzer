import { Router, Request, Response } from 'express';
import { query, execute } from '../db';
import { PUBLIC_ONLY_CONDITION } from '../utils/publicFilter';

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
    'cms', 'title', 'final_domain',
    'city', 'state', 'domain_type',
  ]);
  const rawSort = SORTABLE.has(sort) ? sort : 'domain';
  // final_domain is a computed alias — must reference the expression in ORDER BY
  const FINAL_DOMAIN_SQL = `CASE WHEN redirect = 1 AND url IS NOT NULL AND url != '' THEN SUBSTRING_INDEX(SUBSTRING_INDEX(url, '/', 3), '//', -1) ELSE domain END`;
  const safeSort = rawSort === 'final_domain' ? FINAL_DOMAIN_SQL : rawSort;

  // Build filter clauses
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (search) {
    conditions.push('(domain LIKE :search OR agency LIKE :search OR bureau LIKE :search OR title LIKE :search OR city LIKE :search OR state LIKE :search)');
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
  if (req.query.no_redirect === 'true') conditions.push('(redirect = 0 OR redirect IS NULL)');
  if (req.query.public_only === 'true') conditions.push(PUBLIC_ONLY_CONDITION);
  if (req.query.agency) {
    conditions.push('agency = :agency');
    params.agency = req.query.agency;
  }
  if (req.query.bureau) {
    conditions.push('bureau = :bureau');
    params.bureau = req.query.bureau;
  }
  if (req.query.domain_type) {
    conditions.push('domain_type = :domain_type');
    params.domain_type = req.query.domain_type;
  }
  if (req.query.state) {
    conditions.push('state = :state');
    params.state = req.query.state;
  }
  if (req.query.city) {
    conditions.push('city LIKE :city');
    params.city = `%${req.query.city}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // COUNT(*) may be returned as a string — cast to Number
    const countRows = await query<{ count: string }>(`SELECT COUNT(*) as count FROM sites ${where}`, params);
    const total = Number(countRows[0].count);

    const rows = await query(
      `SELECT *, ${FINAL_DOMAIN_SQL} AS final_domain FROM sites ${where} ORDER BY ${safeSort} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );

    res.json({
      data: rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('[sites] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// GET /api/v1/sites/domain-types — distinct domain_type values for filter dropdown
// Must be registered before /:domain to avoid the param handler catching it
router.get('/domain-types', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ domain_type: string }>(
      'SELECT DISTINCT domain_type FROM sites WHERE domain_type IS NOT NULL ORDER BY domain_type'
    );
    res.json(rows.map(r => r.domain_type));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sites/:domain - single site with scan history
router.get('/:domain', async (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const site = (await query('SELECT * FROM sites WHERE domain = ?', [domain]))[0];

  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  // ETag based on domain + updated_at — lets browsers and CDNs skip re-fetching unchanged records
  const etag = `"${domain}-${(site as any).updated_at || 'nodate'}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, max-age=300');
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  const scanHistory = await query(
    'SELECT * FROM scan_history WHERE domain = ? ORDER BY scanned_at DESC LIMIT 20',
    [domain]
  );

  const briefings = await query(
    'SELECT id, domain, created_at, provider, model, full_markdown FROM briefings WHERE domain = ? ORDER BY created_at DESC LIMIT 5',
    [domain]
  );

  // Domains in the DB that redirect to this domain
  const redirectSourceRows = await query<{ domain: string }>(
    `SELECT domain FROM sites WHERE redirect = 1 AND SUBSTRING_INDEX(SUBSTRING_INDEX(url, '/', 3), '//', -1) = ? ORDER BY domain`,
    [domain]
  );
  const redirect_sources = redirectSourceRows.map((r) => r.domain);

  res.json({ site, scan_history: scanHistory, briefings, redirect_sources });
});

// PUT /api/v1/sites/:domain - update site record
router.put('/:domain', async (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const updates = req.body as Record<string, unknown>;

  const existing = (await query('SELECT domain FROM sites WHERE domain = ?', [domain]))[0];
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

  // Only allow valid SQL identifiers (letters, digits, underscores) as column
  // names — prevents injection through keys like `x = 1; DROP TABLE sites --`.
  const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/i;
  const cols = Object.keys(safeUpdates).filter(k => k !== 'domain' && IDENTIFIER_RE.test(k));
  if (cols.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }
  const setClause = cols.map(k => `\`${k}\` = :${k}`).join(', ');

  await execute(`UPDATE sites SET ${setClause} WHERE domain = :domain`, safeUpdates);

  const updated = (await query('SELECT * FROM sites WHERE domain = ?', [domain]))[0];
  res.json(updated);
});

export default router;
