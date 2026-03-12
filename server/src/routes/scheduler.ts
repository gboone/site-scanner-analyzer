import { Router, Request, Response } from 'express';
import {
  getStatus,
  saveSettings,
  reconfigure,
  runGsaRefresh,
  runSiteRescan,
  type ScheduleInterval,
  type ScanFilter,
} from '../scheduler';
import { config } from '../config';

const router = Router();

const VALID_INTERVALS = new Set<ScheduleInterval>(['6h', '12h', '24h', '48h', 'weekly']);
const VALID_FILTERS = new Set<ScanFilter>(['all', 'public', 'live']);

// GET /api/v1/scheduler/status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/scheduler/gsa — update GSA job config
router.put('/gsa', async (req: Request, res: Response) => {
  const { enabled, interval, agency } = req.body as {
    enabled?: boolean;
    interval?: string;
    agency?: string;
  };

  if (interval !== undefined && !VALID_INTERVALS.has(interval as ScheduleInterval)) {
    res.status(400).json({ error: `Invalid interval. Valid values: ${[...VALID_INTERVALS].join(', ')}` });
    return;
  }

  const updates: Record<string, string> = {};
  if (enabled !== undefined) updates['SCHEDULER_GSA_ENABLED'] = String(enabled);
  if (interval !== undefined) updates['SCHEDULER_GSA_INTERVAL'] = interval;
  if (agency !== undefined) updates['SCHEDULER_GSA_AGENCY'] = agency;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    await saveSettings(updates);
    await reconfigure();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/scheduler/scan — update site rescan job config
router.put('/scan', async (req: Request, res: Response) => {
  const { enabled, interval, filter } = req.body as {
    enabled?: boolean;
    interval?: string;
    filter?: string;
  };

  if (interval !== undefined && !VALID_INTERVALS.has(interval as ScheduleInterval)) {
    res.status(400).json({ error: `Invalid interval. Valid values: ${[...VALID_INTERVALS].join(', ')}` });
    return;
  }
  if (filter !== undefined && !VALID_FILTERS.has(filter as ScanFilter)) {
    res.status(400).json({ error: `Invalid filter. Valid values: ${[...VALID_FILTERS].join(', ')}` });
    return;
  }

  const updates: Record<string, string> = {};
  if (enabled !== undefined) updates['SCHEDULER_SCAN_ENABLED'] = String(enabled);
  if (interval !== undefined) updates['SCHEDULER_SCAN_INTERVAL'] = interval;
  if (filter !== undefined) updates['SCHEDULER_SCAN_FILTER'] = filter;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    await saveSettings(updates);
    await reconfigure();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/scheduler/gsa/run — trigger GSA refresh immediately
router.post('/gsa/run', async (req: Request, res: Response) => {
  if (!config.gsaApiKey) {
    res.status(400).json({ error: 'GSA_API_KEY not configured. Add it in Settings.' });
    return;
  }
  // Respond immediately; job runs in the background
  res.json({ ok: true, message: 'GSA refresh triggered' });
  runGsaRefresh().catch(console.error);
});

// POST /api/v1/scheduler/scan/run — trigger site rescan immediately
router.post('/scan/run', async (_req: Request, res: Response) => {
  // Respond immediately; job runs in the background
  res.json({ ok: true, message: 'Site rescan triggered' });
  runSiteRescan().catch(console.error);
});

export default router;
