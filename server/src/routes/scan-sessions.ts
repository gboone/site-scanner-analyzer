import { Router, Request, Response } from 'express';
import { query, execute } from '../db';

const router = Router();

// GET /api/v1/scan-sessions — list recent sessions (newest first)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sessions = await query(
      'SELECT * FROM scan_sessions ORDER BY started_at DESC LIMIT 20'
    );
    res.json(sessions);
  } catch (err: any) {
    console.error('[scan-sessions] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch scan sessions' });
  }
});

// POST /api/v1/scan-sessions — create a new session when a bulk scan starts
router.post('/', async (req: Request, res: Response) => {
  const { total_domains, label } = req.body as { total_domains?: number; label?: string };
  try {
    const now = new Date().toISOString();
    const result = await execute(
      `INSERT INTO scan_sessions (started_at, status, total_domains, label)
       VALUES (:started_at, :status, :total_domains, :label)`,
      {
        started_at: now,
        status: 'running',
        total_domains: total_domains ?? 0,
        label: label ?? null,
      }
    );
    res.json({ id: result.insertId });
  } catch (err: any) {
    console.error('[scan-sessions] POST error:', err.message);
    res.status(500).json({ error: 'Failed to create scan session' });
  }
});

// PATCH /api/v1/scan-sessions/:id — update progress or finalise a session
router.patch('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid session id' });
    return;
  }

  const { status, completed_count, failed_count } = req.body as {
    status?: string;
    completed_count?: number;
    failed_count?: number;
  };

  const updates: Record<string, unknown> = {};
  if (status !== undefined) {
    updates.status = status;
    if (status === 'completed' || status === 'stopped') {
      updates.completed_at = new Date().toISOString();
    }
  }
  if (completed_count !== undefined) updates.completed_count = completed_count;
  if (failed_count !== undefined) updates.failed_count = failed_count;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    const cols = Object.keys(updates);
    const setClause = cols.map(k => `\`${k}\` = :${k}`).join(', ');
    updates.id = id;
    await execute(`UPDATE scan_sessions SET ${setClause} WHERE id = :id`, updates);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[scan-sessions] PATCH error:', err.message);
    res.status(500).json({ error: 'Failed to update scan session' });
  }
});

export default router;
