/**
 * Scheduled job manager.
 * Reads config from the settings table and runs three background jobs:
 *   1. GSA data refresh      — calls importFromGsa()
 *   2. Site re-scan          — iterates over filtered sites and calls scanAndStore()
 *   3. get.gov registry sync — calls importFromGetGov()
 *
 * Call setupScheduler() once after DB init. Call reconfigure() whenever
 * scheduler settings change so jobs restart with the new schedule.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { query, execute } from './db';
import { importFromGsa, type GsaImportResult } from './routes/gsa';
import { importFromGetGov } from './routes/getgov';
import { scanAndStore } from './scanner/orchestrator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleInterval = '6h' | '12h' | '24h' | '48h' | 'weekly';

export type ScanFilter = 'all' | 'public' | 'live';

export interface GsaScheduleConfig {
  enabled: boolean;
  interval: ScheduleInterval;
  agency?: string;
}

export interface ScanScheduleConfig {
  enabled: boolean;
  interval: ScheduleInterval;
  filter: ScanFilter;
}

export interface GetGovScheduleConfig {
  enabled: boolean;
  interval: ScheduleInterval;
}

export interface SchedulerStatus {
  gsa: GsaScheduleConfig & { last_run?: string; last_status?: string };
  scan: ScanScheduleConfig & { last_run?: string; last_status?: string; last_session_id?: string };
  getgov: GetGovScheduleConfig & { last_run?: string; last_status?: string };
}

// ---------------------------------------------------------------------------
// Interval → cron expression
// ---------------------------------------------------------------------------

const INTERVAL_CRON: Record<ScheduleInterval, string> = {
  '6h':     '0 */6 * * *',
  '12h':    '0 */12 * * *',
  '24h':    '0 2 * * *',
  '48h':    '0 2 */2 * *',
  'weekly': '0 2 * * 0',
};

// ---------------------------------------------------------------------------
// Filter → SQL WHERE clause
// ---------------------------------------------------------------------------

const FILTER_WHERE: Record<ScanFilter, string> = {
  all:    '',
  // is_public is computed during rescan and mirrors PUBLIC_ONLY_CONDITION:
  // live, non-redirect, non-staging/dev/VPN domain, non-login-page title.
  // Orthogonal to excluded — both must pass.
  public: 'WHERE is_public = 1 AND (excluded = 0 OR excluded IS NULL)',
  live:   'WHERE live = 1 AND (excluded = 0 OR excluded IS NULL)',
};

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

const SCHEDULER_KEYS = [
  'SCHEDULER_GSA_ENABLED', 'SCHEDULER_GSA_INTERVAL', 'SCHEDULER_GSA_AGENCY',
  'SCHEDULER_SCAN_ENABLED', 'SCHEDULER_SCAN_INTERVAL', 'SCHEDULER_SCAN_FILTER',
  'SCHEDULER_GSA_LAST_RUN', 'SCHEDULER_GSA_LAST_STATUS',
  'SCHEDULER_SCAN_LAST_RUN', 'SCHEDULER_SCAN_LAST_STATUS', 'SCHEDULER_SCAN_LAST_SESSION_ID',
  'SCHEDULER_GETGOV_ENABLED', 'SCHEDULER_GETGOV_INTERVAL',
  'SCHEDULER_GETGOV_LAST_RUN', 'SCHEDULER_GETGOV_LAST_STATUS',
] as const;

async function readSettings(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>(
    `SELECT \`key\`, value FROM settings WHERE \`key\` IN (${SCHEDULER_KEYS.map(() => '?').join(', ')})`,
    SCHEDULER_KEYS as unknown as string[]
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO settings (\`key\`, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%SZ')`,
    [key, value]
  );
}

// ---------------------------------------------------------------------------
// Active cron tasks (module-level so reconfigure() can stop them)
// ---------------------------------------------------------------------------

let gsaTask: ScheduledTask | null = null;
let scanTask: ScheduledTask | null = null;
let getgovTask: ScheduledTask | null = null;
let scanRunning = false;
let gsaRunning = false;
let getgovRunning = false;

// ---------------------------------------------------------------------------
// GSA refresh job
// ---------------------------------------------------------------------------

export async function runGsaRefresh(): Promise<void> {
  if (gsaRunning) {
    console.log('[scheduler] GSA refresh already running — skipping');
    return;
  }
  gsaRunning = true;
  const startTime = new Date().toISOString();
  console.log(`[scheduler] GSA refresh started at ${startTime}`);
  await writeSetting('SCHEDULER_GSA_LAST_RUN', startTime);

  try {
    const settings = await readSettings();
    const agency = settings['SCHEDULER_GSA_AGENCY'] || undefined;

    const result: GsaImportResult = await importFromGsa(agency, {
      onProgress: (page, total) => {
        console.log(`[scheduler] GSA refresh: page ${page}/${total}`);
      },
    });

    const status = `ok: ${result.inserted} inserted, ${result.updated} updated`;
    await writeSetting('SCHEDULER_GSA_LAST_STATUS', status);
    console.log(`[scheduler] GSA refresh complete — ${status}`);
  } catch (err: any) {
    const status = `error: ${err.message}`;
    await writeSetting('SCHEDULER_GSA_LAST_STATUS', status).catch(() => {});
    console.error(`[scheduler] GSA refresh failed:`, err.message);
  } finally {
    gsaRunning = false;
  }
}

// ---------------------------------------------------------------------------
// get.gov registry refresh job
// ---------------------------------------------------------------------------

export async function runGetGovRefresh(): Promise<void> {
  if (getgovRunning) {
    console.log('[scheduler] get.gov refresh already running — skipping');
    return;
  }
  getgovRunning = true;
  const startTime = new Date().toISOString();
  console.log(`[scheduler] get.gov refresh started at ${startTime}`);
  await writeSetting('SCHEDULER_GETGOV_LAST_RUN', startTime);

  try {
    const result = await importFromGetGov({
      onProgress: (processed, total) => {
        console.log(`[scheduler] get.gov refresh: ${processed}/${total} rows`);
      },
    });

    const status = `ok: ${result.inserted} inserted, ${result.updated} updated, ${result.new_federal} new federal, ${result.new_nonfederal} new non-federal`;
    await writeSetting('SCHEDULER_GETGOV_LAST_STATUS', status);
    console.log(`[scheduler] get.gov refresh complete — ${status}`);
  } catch (err: any) {
    const status = `error: ${err.message}`;
    await writeSetting('SCHEDULER_GETGOV_LAST_STATUS', status).catch(() => {});
    console.error(`[scheduler] get.gov refresh failed:`, err.message);
  } finally {
    getgovRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Site rescan job
// ---------------------------------------------------------------------------

/** Simple concurrency limiter (avoids adding p-limit as a server dep). */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
}

export async function runSiteRescan(): Promise<void> {
  if (scanRunning) {
    console.log('[scheduler] Site rescan already running — skipping');
    return;
  }
  scanRunning = true;
  const startTime = new Date().toISOString();
  console.log(`[scheduler] Site rescan started at ${startTime}`);
  await writeSetting('SCHEDULER_SCAN_LAST_RUN', startTime);

  try {
    const settings = await readSettings();
    const filter = (settings['SCHEDULER_SCAN_FILTER'] as ScanFilter) || 'all';
    const where = FILTER_WHERE[filter] || '';

    const sites = await query<{ domain: string; url: string | null }>(
      `SELECT domain, url FROM sites ${where}`
    );

    if (sites.length === 0) {
      await writeSetting('SCHEDULER_SCAN_LAST_STATUS', 'ok: 0 sites matched filter');
      scanRunning = false;
      return;
    }

    // Create a scan session to track progress
    const sessionResult = await execute(
      `INSERT INTO scan_sessions (started_at, status, total_domains, label)
       VALUES (?, 'running', ?, ?)`,
      [startTime, sites.length, `Scheduled rescan — ${filter}`]
    );
    const sessionId = sessionResult.insertId;
    await writeSetting('SCHEDULER_SCAN_LAST_SESSION_ID', String(sessionId));

    let completed = 0;
    let failed = 0;

    await withConcurrency(sites, 3, async (site) => {
      try {
        const url = site.url || `https://${site.domain}`;
        await scanAndStore(site.domain, url);
        completed++;
      } catch (err: any) {
        console.error(`[scheduler] Scan failed for ${site.domain}:`, err.message);
        failed++;
      }
      // Update session progress every 10 sites
      if ((completed + failed) % 10 === 0) {
        await execute(
          'UPDATE scan_sessions SET completed_count = ?, failed_count = ? WHERE id = ?',
          [completed, failed, sessionId]
        ).catch(() => {});
      }
    });

    // Finalise the session
    await execute(
      `UPDATE scan_sessions
       SET status = 'completed', completed_at = ?, completed_count = ?, failed_count = ?
       WHERE id = ?`,
      [new Date().toISOString(), completed, failed, sessionId]
    );

    const status = `ok: ${completed} completed, ${failed} failed`;
    await writeSetting('SCHEDULER_SCAN_LAST_STATUS', status);
    console.log(`[scheduler] Site rescan complete — ${status}`);
  } catch (err: any) {
    const status = `error: ${err.message}`;
    await writeSetting('SCHEDULER_SCAN_LAST_STATUS', status).catch(() => {});
    console.error(`[scheduler] Site rescan failed:`, err.message);
  } finally {
    scanRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Scheduler lifecycle
// ---------------------------------------------------------------------------

async function buildTasks(): Promise<void> {
  // Stop existing tasks first
  gsaTask?.stop();
  gsaTask = null;
  scanTask?.stop();
  scanTask = null;
  getgovTask?.stop();
  getgovTask = null;

  const settings = await readSettings();

  const gsaEnabled = settings['SCHEDULER_GSA_ENABLED'] === 'true';
  const gsaInterval = (settings['SCHEDULER_GSA_INTERVAL'] as ScheduleInterval) || '24h';

  const scanEnabled = settings['SCHEDULER_SCAN_ENABLED'] === 'true';
  const scanInterval = (settings['SCHEDULER_SCAN_INTERVAL'] as ScheduleInterval) || '24h';

  const getgovEnabled = settings['SCHEDULER_GETGOV_ENABLED'] === 'true';
  const getgovInterval = (settings['SCHEDULER_GETGOV_INTERVAL'] as ScheduleInterval) || '24h';

  if (gsaEnabled) {
    const expr = INTERVAL_CRON[gsaInterval];
    gsaTask = cron.schedule(expr, () => { runGsaRefresh().catch(console.error); });
    console.log(`[scheduler] GSA refresh scheduled: ${expr} (every ${gsaInterval})`);
  } else {
    console.log('[scheduler] GSA refresh: disabled');
  }

  if (scanEnabled) {
    const expr = INTERVAL_CRON[scanInterval];
    scanTask = cron.schedule(expr, () => { runSiteRescan().catch(console.error); });
    console.log(`[scheduler] Site rescan scheduled: ${expr} (every ${scanInterval})`);
  } else {
    console.log('[scheduler] Site rescan: disabled');
  }

  if (getgovEnabled) {
    const expr = INTERVAL_CRON[getgovInterval];
    getgovTask = cron.schedule(expr, () => { runGetGovRefresh().catch(console.error); });
    console.log(`[scheduler] get.gov refresh scheduled: ${expr} (every ${getgovInterval})`);
  } else {
    console.log('[scheduler] get.gov refresh: disabled');
  }
}

/** Read settings from DB and start/restart scheduled jobs. */
export async function setupScheduler(): Promise<void> {
  try {
    await buildTasks();
  } catch (err: any) {
    console.error('[scheduler] Failed to set up scheduler:', err.message);
  }
}

/** Re-read settings and restart jobs. Called after config changes. */
export async function reconfigure(): Promise<void> {
  await buildTasks();
}

/** Return current scheduler config + last-run info for the API. */
export async function getStatus(): Promise<SchedulerStatus> {
  const settings = await readSettings();
  return {
    gsa: {
      enabled: settings['SCHEDULER_GSA_ENABLED'] === 'true',
      interval: (settings['SCHEDULER_GSA_INTERVAL'] as ScheduleInterval) || '24h',
      agency: settings['SCHEDULER_GSA_AGENCY'] || undefined,
      last_run: settings['SCHEDULER_GSA_LAST_RUN'],
      last_status: settings['SCHEDULER_GSA_LAST_STATUS'],
    },
    scan: {
      enabled: settings['SCHEDULER_SCAN_ENABLED'] === 'true',
      interval: (settings['SCHEDULER_SCAN_INTERVAL'] as ScheduleInterval) || '24h',
      filter: (settings['SCHEDULER_SCAN_FILTER'] as ScanFilter) || 'all',
      last_run: settings['SCHEDULER_SCAN_LAST_RUN'],
      last_status: settings['SCHEDULER_SCAN_LAST_STATUS'],
      last_session_id: settings['SCHEDULER_SCAN_LAST_SESSION_ID'],
    },
    getgov: {
      enabled: settings['SCHEDULER_GETGOV_ENABLED'] === 'true',
      interval: (settings['SCHEDULER_GETGOV_INTERVAL'] as ScheduleInterval) || '24h',
      last_run: settings['SCHEDULER_GETGOV_LAST_RUN'],
      last_status: settings['SCHEDULER_GETGOV_LAST_STATUS'],
    },
  };
}

/** Write a batch of scheduler settings. */
export async function saveSettings(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await writeSetting(key, value);
  }
}

/** Stop all cron tasks. Called during graceful shutdown. */
export function shutdown(): void {
  if (gsaTask)    { gsaTask.stop();    gsaTask = null; }
  if (scanTask)   { scanTask.stop();   scanTask = null; }
  if (getgovTask) { getgovTask.stop(); getgovTask = null; }
  console.log('[scheduler] Jobs stopped.');
}
