import { Router } from 'express';
import type { Request, Response } from 'express';
import { query, execute, transaction, toPositional } from '../db/index.js';
import { discoverSubdomains } from '../scanner/subdomains.js';
import { scanQueue } from '../lib/scan-queue.js';

const router = Router();
export default router;

const GETGOV_CSV_URL = 'https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-full.csv';
// Actual domain type values from the get.gov CSV use "Federal - Executive",
// "Federal - Legislative", "Federal - Judicial" etc.
const isFederalType = (t: string) => t.startsWith('Federal');

// ---------------------------------------------------------------------------
// CSV parser — handles quoted fields, parses by header name (not index)
// ---------------------------------------------------------------------------
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Upsert SQL — minimal: only fill gaps or overwrite domain_type on conflict
// ---------------------------------------------------------------------------
const UPSERT_SQL = `
  INSERT INTO sites (domain, domain_type, city, state, security_contact_email, name, agency, imported_at, updated_at)
  VALUES (:domain, :domain_type, :city, :state, :security_contact_email, :name, :agency, :imported_at, :updated_at)
  ON DUPLICATE KEY UPDATE
    domain_type            = VALUES(domain_type),
    updated_at             = VALUES(updated_at),
    city                   = COALESCE(city, VALUES(city)),
    state                  = COALESCE(state, VALUES(state)),
    security_contact_email = COALESCE(security_contact_email, VALUES(security_contact_email)),
    name                   = COALESCE(name, VALUES(name)),
    agency                 = COALESCE(agency, VALUES(agency))
`;

// ---------------------------------------------------------------------------
// Public types + exported import function
// ---------------------------------------------------------------------------
export interface GetGovImportResult {
  inserted: number;
  updated: number;
  total_rows: number;
  error_count: number;
  errors: string[];
  new_federal: number;
  new_nonfederal: number;
}

export interface GetGovImportCallbacks {
  onStart?: (totalRows: number) => void;
  onProgress?: (processed: number, total: number, inserted: number, updated: number) => void;
}

export async function importFromGetGov(
  callbacks?: GetGovImportCallbacks
): Promise<GetGovImportResult> {
  const res = await fetch(GETGOV_CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch get.gov CSV: HTTP ${res.status}`);

  const text = await res.text();
  const rows = parseCsv(text);

  callbacks?.onStart?.(rows.length);

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];
  const newFederalDomains: string[] = [];
  const newNonfederalDomains: string[] = [];

  // Load existing domains once
  const existing = await query<{ domain: string }>('SELECT domain FROM sites');
  const existingDomains = new Set(existing.map(r => r.domain));

  const BATCH_SIZE = 100;
  const PROGRESS_EVERY = 500;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valid: Array<{ row: Record<string, unknown>; isNew: boolean; domain: string; isFederal: boolean }> = [];

    for (const csv of batch) {
      // Actual CSV columns (as of 2025):
      //   Domain name, Domain type, Organization name, Suborganization name, City, State, Security contact email
      const domain = (csv['Domain name'] ?? '').toLowerCase().trim();
      if (!domain) continue;
      const domainType = (csv['Domain type'] ?? '').trim();
      const isNew = !existingDomains.has(domain);
      existingDomains.add(domain); // deduplicate within payload
      valid.push({
        domain,
        isNew,
        isFederal: isFederalType(domainType),
        row: {
          domain,
          domain_type:            domainType || null,
          city:                   csv['City']?.trim() || null,
          state:                  csv['State']?.trim() || null,
          security_contact_email: csv['Security contact email']?.trim() || null,
          name:                   csv['Organization name']?.trim() || null,
          agency:                 csv['Suborganization name']?.trim() || null,
          imported_at:            now,
          updated_at:             now,
        },
      });
    }

    try {
      await transaction(async (client) => {
        for (const { row } of valid) {
          const [sql, args] = toPositional(UPSERT_SQL, row);
          await client.query(sql, args);
        }
      });

      for (const { isNew, domain, isFederal } of valid) {
        if (isNew) {
          inserted++;
          if (isFederal) newFederalDomains.push(domain);
          else newNonfederalDomains.push(domain);
        } else {
          updated++;
        }
      }
    } catch (e: any) {
      errors.push(`Batch error (rows ${i}–${i + batch.length - 1}): ${e.message}`);
    }

    // Fire progress callback every PROGRESS_EVERY rows
    const processed = Math.min(i + BATCH_SIZE, rows.length);
    if (processed % PROGRESS_EVERY < BATCH_SIZE || processed === rows.length) {
      callbacks?.onProgress?.(processed, rows.length, inserted, updated);
    }
  }

  // Enqueue all new domains for scanning (fire-and-forget)
  const scanJobs = [...newFederalDomains, ...newNonfederalDomains].map(domain => ({
    domain,
    url: `https://${domain}`,
  }));
  if (scanJobs.length > 0) scanQueue.enqueue(scanJobs);

  // Discover subdomains for non-federal domains in background
  if (newNonfederalDomains.length > 0) {
    discoverAndEnqueueSubdomains(newNonfederalDomains).catch(err => {
      console.error('[getgov] subdomain discovery error:', err?.message ?? err);
    });
  }

  return {
    inserted,
    updated,
    total_rows: rows.length,
    error_count: errors.length,
    errors: errors.slice(0, 20),
    new_federal: newFederalDomains.length,
    new_nonfederal: newNonfederalDomains.length,
  };
}

/**
 * Discovers subdomains for a list of non-federal domains, inserts them with
 * INSERT IGNORE (preserve existing rows), and enqueues them for scanning.
 * Runs up to 3 crt.sh lookups concurrently to avoid overwhelming the service.
 */
async function discoverAndEnqueueSubdomains(domains: string[]): Promise<void> {
  const CONCURRENCY = 3;

  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(d => discoverSubdomains(d)));

    const subdomainJobs: Array<{ domain: string; url: string }> = [];

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status !== 'fulfilled' || result.value.length === 0) continue;

      const parentDomain = batch[j];
      const parentRows = await query<{ domain_type: string }>(
        'SELECT domain_type FROM sites WHERE domain = ? LIMIT 1',
        [parentDomain]
      );
      const domainType = parentRows[0]?.domain_type ?? null;
      const now = new Date().toISOString();

      for (const sub of result.value) {
        try {
          await execute(
            'INSERT IGNORE INTO sites (domain, domain_type, imported_at, updated_at) VALUES (?, ?, ?, ?)',
            [sub, domainType, now, now]
          );
          subdomainJobs.push({ domain: sub, url: `https://${sub}` });
        } catch {
          // ignore individual insert errors
        }
      }
    }

    if (subdomainJobs.length > 0) scanQueue.enqueue(subdomainJobs);
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/getgov/import — stream ndjson progress
// ---------------------------------------------------------------------------
router.post('/import', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const send = (data: object) => res.write(JSON.stringify(data) + '\n');

  try {
    const result = await importFromGetGov({
      onStart: (totalRows) => {
        send({ type: 'start', totalRows });
      },
      onProgress: (processed, total, inserted, updated) => {
        send({ type: 'progress', processed, total, inserted, updated });
      },
    });

    res.end(
      JSON.stringify({
        type: 'complete',
        inserted: result.inserted,
        updated: result.updated,
        total_rows: result.total_rows,
        new_federal: result.new_federal,
        new_nonfederal: result.new_nonfederal,
        error_count: result.error_count,
        errors: result.errors,
      }) + '\n'
    );
  } catch (err: any) {
    res.end(JSON.stringify({ type: 'error', error: err.message }) + '\n');
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/getgov/test — check CSV reachability
// ---------------------------------------------------------------------------
router.get('/test', async (_req: Request, res: Response) => {
  try {
    const r = await fetch(GETGOV_CSV_URL, { method: 'HEAD' });
    res.json({ reachable: r.ok, status: r.status, url: GETGOV_CSV_URL });
  } catch (err: any) {
    res.json({ reachable: false, error: err.message, url: GETGOV_CSV_URL });
  }
});
