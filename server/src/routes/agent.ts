import { Router } from 'express';
import type { Request, Response } from 'express';
import { query } from '../db';
import { PUBLIC_ONLY_CONDITION } from '../utils/publicFilter';
import { simplify } from '../utils/simplify';
import { buildColumnFilters } from '../utils/columnFilters';

const router = Router();

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Slug helpers (agency/:slug route)
// ---------------------------------------------------------------------------

function slugToLikePattern(slug: string): string {
  return slug.replace(/-/g, '%');
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: unknown): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatNumber(value: unknown): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('en-US');
}

function toHeaderLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


// ---------------------------------------------------------------------------
// Pagination URL builder — preserves all current query params, swaps page
// ---------------------------------------------------------------------------

function pageUrl(req: Request, page: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'page' && v != null) params.set(k, String(v));
  }
  params.set('page', String(page));
  return `?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 1400px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: .25rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem 1.5rem; }
  dt { font-weight: 600; }
  dd { margin: 0; }
  ul { margin: 0; padding-left: 1.2em; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; margin-top: .5rem; }
  th, td { text-align: left; padding: .3rem .5rem; border: 1px solid #ddd; white-space: nowrap; }
  th { background: #f4f4f4; font-weight: 600; position: sticky; top: 0; }
  tr:nth-child(even) { background: #fafafa; }
  p.note { color: #555; font-size: .85rem; }
  code { background: #f4f4f4; padding: .1em .4em; border-radius: 3px; font-size: .85em; }
  nav.pagination { margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem; font-size: .9rem; }
  nav.pagination a { color: #1a56db; text-decoration: none; }
  nav.pagination a:hover { text-decoration: underline; }
  nav.pagination span { color: #555; }
`.trim();

// ---------------------------------------------------------------------------
// Core renderer
// ---------------------------------------------------------------------------

function renderSitesPage(opts: {
  title: string;
  subtitle: string;
  allRows: Record<string, unknown>[];   // all simplified rows (for summary)
  pageRows: Record<string, unknown>[];  // current page's rows (for table)
  page: number;
  totalPages: number;
  req: Request;
}): string {
  const { title, subtitle, allRows, pageRows, page, totalPages, req } = opts;

  const visibleKeys = Object.keys(pageRows[0] ?? {});

  // ---- Summary (computed from all rows) ------------------------------------
  const bureauCounts = new Map<string, number>();
  for (const row of allRows) {
    const b = String(row.bureau ?? '').trim();
    if (b) bureauCounts.set(b, (bureauCounts.get(b) ?? 0) + 1);
  }
  const bureauRows = [...bureauCounts.entries()].sort((a, b) => b[1] - a[1]);

  function distinctVals(key: string): string[] {
    const seen = new Set<string>();
    for (const row of allRows) {
      const v = String(row[key] ?? '').trim();
      if (v) seen.add(v);
    }
    return [...seen].sort();
  }
  const cmsVals       = distinctVals('cms');
  const hostingVals   = distinctVals('hosting_provider');
  const webServerVals = distinctVals('web_server');

  let summaryHtml = `<section>\n<h2>Summary</h2>\n<dl>\n  <dt>Total sites</dt><dd>${escapeHtml(allRows.length)}</dd>`;
  if (bureauRows.length > 1) {
    summaryHtml += `\n  <dt>Bureaus / offices</dt>\n  <dd><ul>`;
    for (const [bureau, count] of bureauRows) {
      summaryHtml += `\n    <li>${escapeHtml(bureau)} (${count})</li>`;
    }
    summaryHtml += `\n  </ul></dd>`;
  }
  if (cmsVals.length)       summaryHtml += `\n  <dt>CMS platforms</dt><dd>${cmsVals.map(escapeHtml).join(', ')}</dd>`;
  if (hostingVals.length)   summaryHtml += `\n  <dt>Hosting providers</dt><dd>${hostingVals.map(escapeHtml).join(', ')}</dd>`;
  if (webServerVals.length) summaryHtml += `\n  <dt>Web servers</dt><dd>${webServerVals.map(escapeHtml).join(', ')}</dd>`;
  summaryHtml += `\n</dl>\n</section>`;

  // ---- Table ---------------------------------------------------------------
  let tableHtml = `<section>\n<h2>Sites</h2>\n<table>\n<thead>\n<tr>\n`;
  for (const k of visibleKeys) {
    tableHtml += `  <th>${escapeHtml(toHeaderLabel(k))}</th>\n`;
  }
  tableHtml += `</tr>\n</thead>\n<tbody>\n`;

  for (const row of pageRows) {
    tableHtml += `<tr>\n`;
    for (const k of visibleKeys) {
      const raw = row[k];
      let cell: string;
      if (raw == null || raw === '') {
        cell = '';
      } else if (Array.isArray(raw)) {
        cell = escapeHtml(raw.join(', '));
      } else if (k === 'pageviews' || k === 'uswds_count' || k === 'third_party_service_count' ||
                 k === 'sitemap_xml_count' || k === 'sitemap_xml_pdf_count') {
        cell = formatNumber(raw);
      } else if (k.endsWith('_date') || k.endsWith('lastmod')) {
        cell = formatDate(raw);
      } else {
        cell = escapeHtml(raw);
      }
      tableHtml += `  <td>${cell}</td>\n`;
    }
    tableHtml += `</tr>\n`;
  }
  tableHtml += `</tbody>\n</table>\n`;

  // ---- Pagination ----------------------------------------------------------
  if (totalPages > 1) {
    tableHtml += `<nav class="pagination" aria-label="Pagination">\n`;
    if (page > 1) {
      tableHtml += `  <a href="${escapeHtml(pageUrl(req, page - 1))}">← Previous</a>\n`;
    }
    tableHtml += `  <span>Page ${page} of ${totalPages} (${allRows.length.toLocaleString('en-US')} sites)</span>\n`;
    if (page < totalPages) {
      tableHtml += `  <a href="${escapeHtml(pageUrl(req, page + 1))}">Next →</a>\n`;
    }
    tableHtml += `</nav>\n`;
  }

  tableHtml += `</section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}${totalPages > 1 ? ` (page ${page} of ${totalPages})` : ''} — Site Scanner</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="note">${escapeHtml(subtitle)}</p>
${summaryHtml}
${tableHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Not found / error pages
// ---------------------------------------------------------------------------

function renderNotFound(message: string, detail: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not Found — Site Scanner</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(message)}</h1>
<p class="note">${escapeHtml(detail)}</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Whitelisted columns for cf_* generic filters (mirrors sites.ts)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Build WHERE clause from explorer-style query params
// ---------------------------------------------------------------------------

function buildWhereClause(req: Request): { where: string; params: Record<string, unknown>; activeLabels: string[] } {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  const activeLabels: string[] = [];

  const search = ((req.query.search as string) || '').trim();
  if (search) {
    conditions.push('(domain LIKE :search OR agency LIKE :search OR bureau LIKE :search OR title LIKE :search)');
    params.search = `%${search}%`;
    activeLabels.push(`search: "${search}"`);
  }

  if (req.query.live === 'true')  { conditions.push('live = 1'); activeLabels.push('live'); }
  if (req.query.live === 'false') { conditions.push('live = 0'); activeLabels.push('not live'); }
  if (req.query.has_uswds === 'true')  { conditions.push('uswds_count > 0'); activeLabels.push('has USWDS'); }
  if (req.query.has_uswds === 'false') { conditions.push('(uswds_count = 0 OR uswds_count IS NULL)'); activeLabels.push('no USWDS'); }
  if (req.query.no_sitemap === 'true')  { conditions.push('sitemap_xml_detected = 0'); activeLabels.push('no sitemap'); }
  if (req.query.no_sitemap === 'false') { conditions.push('sitemap_xml_detected = 1'); activeLabels.push('has sitemap'); }
  if (req.query.has_dap === 'true')  { conditions.push('dap = 1'); activeLabels.push('has DAP'); }
  if (req.query.has_dap === 'false') { conditions.push('(dap = 0 OR dap IS NULL)'); activeLabels.push('no DAP'); }
  if (req.query.https_enforced === 'true')  { conditions.push('https_enforced = 1'); activeLabels.push('HTTPS enforced'); }
  if (req.query.https_enforced === 'false') { conditions.push('(https_enforced = 0 OR https_enforced IS NULL)'); activeLabels.push('HTTPS not enforced'); }
  if (req.query.has_login === 'true')  { conditions.push('login_provider IS NOT NULL'); activeLabels.push('has login'); }
  if (req.query.has_login === 'false') { conditions.push('login_provider IS NULL'); activeLabels.push('no login'); }
  if (req.query.no_redirect === 'true')  { conditions.push('(redirect = 0 OR redirect IS NULL)'); activeLabels.push('hide redirects'); }
  if (req.query.no_redirect === 'false') { conditions.push('redirect = 1'); activeLabels.push('redirects only'); }
  if (req.query.public_only === 'true') { conditions.push(PUBLIC_ONLY_CONDITION); activeLabels.push('public only'); }

  if (req.query.agency) {
    conditions.push('agency = :agency');
    params.agency = req.query.agency;
  }
  if (req.query.bureau) {
    conditions.push('bureau = :bureau');
    params.bureau = req.query.bureau;
    activeLabels.push(`bureau: ${req.query.bureau}`);
  }
  if (req.query.branch) {
    conditions.push('branch = :branch');
    params.branch = req.query.branch;
    activeLabels.push(`type: ${req.query.branch}`);
  }
  if (req.query.state) {
    conditions.push('state = :state');
    params.state = req.query.state;
    activeLabels.push(`state: ${req.query.state}`);
  }
  if (req.query.city) {
    conditions.push('city LIKE :city');
    params.city = `%${req.query.city}%`;
    activeLabels.push(`city: ${req.query.city}`);
  }

  const cmsVal = ((req.query.cms as string) || '').trim();
  const cmsMode = (req.query.cms_mode as string) || 'contains';
  if (cmsVal) {
    if (cmsMode === 'exact') {
      conditions.push('cms = :cms'); params.cms = cmsVal;
    } else if (cmsMode === 'excludes') {
      conditions.push('(cms NOT LIKE :cms OR cms IS NULL)'); params.cms = `%${cmsVal}%`;
    } else {
      conditions.push('cms LIKE :cms'); params.cms = `%${cmsVal}%`;
    }
    activeLabels.push(`CMS ${cmsMode} "${cmsVal}"`);
  }

  const titleVal = ((req.query.title_filter as string) || '').trim();
  const titleMode = (req.query.title_mode as string) || 'contains';
  if (titleVal) {
    if (titleMode === 'exact') {
      conditions.push('title = :title_filter'); params.title_filter = titleVal;
    } else if (titleMode === 'excludes') {
      conditions.push('(title NOT LIKE :title_filter OR title IS NULL)'); params.title_filter = `%${titleVal}%`;
    } else {
      conditions.push('title LIKE :title_filter'); params.title_filter = `%${titleVal}%`;
    }
    activeLabels.push(`title ${titleMode} "${titleVal}"`);
  }

  const { conditions: cfConditions, params: cfParams } = buildColumnFilters(req);
  for (const [key] of Object.entries(cfParams)) {
    const field = key.slice(3); // strip cf_ prefix
    const mode = String(req.query[`cfm_${field}`] ?? 'contains');
    activeLabels.push(`${field} ${mode} "${cfParams[key]}"`);
  }
  conditions.push(...cfConditions);
  Object.assign(params, cfParams);

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params, activeLabels };
}

// ---------------------------------------------------------------------------
// Shared route logic: simplify → paginate → render
// ---------------------------------------------------------------------------

function paginateAndRender(opts: {
  req: Request;
  res: Response;
  rawRows: Record<string, unknown>[];
  title: string;
  subtitle: string;
}): void {
  const { req, res, rawRows, title, subtitle } = opts;

  const { rows: allRows } = simplify(rawRows);

  if (allRows.length === 0) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(renderNotFound('No sites found', 'No sites match the current filters.'));
    return;
  }

  const totalPages = allRows.length > PAGE_SIZE ? Math.ceil(allRows.length / PAGE_SIZE) : 1;
  const page = Math.min(totalPages, Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1));
  const pageRows = allRows.length > PAGE_SIZE
    ? allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : allRows;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(renderSitesPage({ title, subtitle, allRows, pageRows, page, totalPages, req }));
}

// ---------------------------------------------------------------------------
// Route: GET /agent/agency/:slug
// ---------------------------------------------------------------------------

router.get('/agency/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug ?? '').trim().toLowerCase();
  const includeInactive = req.query.include_inactive === 'true';

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).send(renderNotFound('Invalid slug', 'The agency slug contains invalid characters.'));
    return;
  }

  try {
    const likePattern = slugToLikePattern(slug);
    const agencyRow = await query<{ agency: string }>(
      `SELECT DISTINCT agency FROM sites
       WHERE LOWER(REPLACE(agency, ' ', '-')) LIKE LOWER(?) AND agency IS NOT NULL
       LIMIT 1`,
      [likePattern],
    );

    if (!agencyRow.length) {
      res.status(404).send(renderNotFound(
        'Agency not found',
        `No agency matching "${slug}" was found. Check that the slug uses hyphens as word separators.`,
      ));
      return;
    }

    const agencyName = agencyRow[0].agency;
    const liveCondition = includeInactive ? '' : 'AND live = 1';

    const rawRows = await query<Record<string, unknown>>(
      `SELECT * FROM sites WHERE agency = ? ${liveCondition} ORDER BY domain ASC`,
      [agencyName],
    );

    if (!rawRows.length) {
      res.status(404).send(renderNotFound('No sites found', `No sites found for agency "${agencyName}".`));
      return;
    }

    const subtitle = includeInactive
      ? 'Showing all sites (including inactive).'
      : 'Showing live sites only. Add ?include_inactive=true to include inactive sites.';

    paginateAndRender({ req, res, rawRows, title: agencyName, subtitle });
  } catch (err: any) {
    console.error('[agent] GET /agency/:slug error:', err.message);
    res.status(500).send(renderNotFound('Server error', 'An internal error occurred.'));
  }
});

// ---------------------------------------------------------------------------
// Route: GET /agent/sites
// ---------------------------------------------------------------------------

router.get('/sites', async (req: Request, res: Response) => {
  const MAX_ROWS = 5000;

  try {
    const { where, params, activeLabels } = buildWhereClause(req);

    const agencyParam = ((req.query.agency as string) || '').trim();
    const bureauParam = ((req.query.bureau as string) || '').trim();
    const searchParam = ((req.query.search as string) || '').trim();

    let title: string;
    if (agencyParam && bureauParam) {
      title = `${agencyParam} — ${bureauParam}`;
    } else if (agencyParam) {
      title = agencyParam;
    } else if (bureauParam) {
      title = bureauParam;
    } else if (searchParam) {
      title = `Search: "${searchParam}"`;
    } else if (activeLabels.length > 0) {
      title = 'Filtered sites';
    } else {
      title = 'All sites';
    }

    const subtitleLabels = activeLabels.filter(l => !l.startsWith('bureau:'));
    const subtitle = subtitleLabels.length > 0
      ? `Filters: ${subtitleLabels.join(', ')}.`
      : (where ? 'Filtered view.' : 'All sites in the database.');

    const rawRows = await query<Record<string, unknown>>(
      `SELECT * FROM sites ${where} ORDER BY agency ASC, domain ASC LIMIT ${MAX_ROWS}`,
      params,
    );

    if (!rawRows.length) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(
        renderNotFound('No sites found', 'No sites match the current filters.'),
      );
      return;
    }

    paginateAndRender({ req, res, rawRows, title, subtitle });
  } catch (err: any) {
    console.error('[agent] GET /sites error:', err.message);
    res.status(500).send(renderNotFound('Server error', 'An internal error occurred.'));
  }
});

export default router;
