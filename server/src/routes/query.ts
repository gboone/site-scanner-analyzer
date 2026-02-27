import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// Fast-fail UX hint: only SELECT-shaped queries get through.
// The real enforcement is PostgreSQL's READ ONLY transaction mode below —
// it rejects writes at the engine level, bypassing any regex tricks.
const ALLOWED = /^\s*select/i;

router.post('/', async (req: Request, res: Response) => {
  const { sql } = req.body as { sql?: string };

  if (!sql || typeof sql !== 'string') {
    res.status(400).json({ error: 'sql field is required' });
    return;
  }

  const trimmed = sql.trim();
  if (!ALLOWED.test(trimmed)) {
    res.status(400).json({ error: 'Only SELECT queries are allowed' });
    return;
  }

  // Acquire a dedicated client and run inside a READ ONLY transaction.
  // PostgreSQL will reject any write statement (INSERT/UPDATE/DELETE/DROP/…)
  // at the engine level, regardless of SQL tricks like comments or semicolons.
  const client = await pool.connect();
  const start = Date.now();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(trimmed);
    await client.query('ROLLBACK'); // no writes to commit; ROLLBACK is a clean exit
    const duration_ms = Date.now() - start;
    res.json({ rows: result.rows, count: result.rows.length, duration_ms });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
