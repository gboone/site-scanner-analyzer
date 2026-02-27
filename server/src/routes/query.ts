import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// Only SELECT queries allowed (PRAGMA is SQLite-specific and not available in PostgreSQL)
const FORBIDDEN = /^\s*(drop|delete|insert|update|create|alter|attach|detach|reindex|vacuum|with\s+.*\s+(delete|insert|update))/i;
const ALLOWED = /^\s*select/i;

router.post('/', async (req: Request, res: Response) => {
  const { sql } = req.body as { sql?: string };

  if (!sql || typeof sql !== 'string') {
    res.status(400).json({ error: 'sql field is required' });
    return;
  }

  const trimmed = sql.trim();
  if (FORBIDDEN.test(trimmed)) {
    res.status(400).json({ error: 'Only SELECT queries are allowed' });
    return;
  }
  if (!ALLOWED.test(trimmed)) {
    res.status(400).json({ error: 'Only SELECT queries are allowed' });
    return;
  }

  const start = Date.now();
  try {
    const rows = await query(trimmed);
    const duration_ms = Date.now() - start;
    res.json({ rows, count: rows.length, duration_ms });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
