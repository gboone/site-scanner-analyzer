import { Router, Request, Response } from 'express';
import { sqlite } from '../db';

const router = Router();

// Only SELECT and safe PRAGMAs allowed
const FORBIDDEN = /^\s*(drop|delete|insert|update|create|alter|attach|detach|reindex|vacuum|with\s+.*\s+(delete|insert|update))/i;
const ALLOWED = /^\s*(select|pragma\s+(table_info|table_list|schema_version|user_version))/i;

router.post('/', (req: Request, res: Response) => {
  const { sql } = req.body as { sql?: string };

  if (!sql || typeof sql !== 'string') {
    res.status(400).json({ error: 'sql field is required' });
    return;
  }

  const trimmed = sql.trim();
  if (FORBIDDEN.test(trimmed)) {
    res.status(400).json({ error: 'Only SELECT queries and safe PRAGMA statements are allowed' });
    return;
  }
  if (!ALLOWED.test(trimmed)) {
    res.status(400).json({ error: 'Only SELECT queries and safe PRAGMA statements are allowed' });
    return;
  }

  const start = Date.now();
  try {
    const stmt = sqlite.prepare(trimmed);
    const rows = stmt.all();
    const duration_ms = Date.now() - start;
    res.json({ rows, count: rows.length, duration_ms });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
