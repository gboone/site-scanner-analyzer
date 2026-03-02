import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// Fast-fail UX hint: only SELECT-shaped queries get through.
// The real enforcement is the READ ONLY transaction below —
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

  // Acquire a dedicated connection and run inside a READ ONLY transaction.
  // MariaDB/MySQL will reject any write statement at the engine level,
  // regardless of SQL tricks like comments or semicolons.
  const client = await pool.getConnection();
  const start = Date.now();
  try {
    await client.query('START TRANSACTION READ ONLY');
    const [rows] = await client.query(trimmed);
    await client.query('ROLLBACK'); // no writes to commit; ROLLBACK is a clean exit
    const duration_ms = Date.now() - start;
    res.json({ rows, count: (rows as any[]).length, duration_ms });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[query] SQL error:', err.message);
    res.status(400).json({ error: 'Query failed. Check your SQL syntax and try again.' });
  } finally {
    client.release();
  }
});

export default router;
