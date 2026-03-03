import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// Fast-fail UX hint: only SELECT-shaped queries get through.
// mysql2 executes a single statement per query() call (multipleStatements
// is off by default), which prevents semicolon-chained write attacks.
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

  // Acquire a dedicated connection so this query doesn't interfere with the
  // shared pool. No explicit transaction — START TRANSACTION READ ONLY is not
  // reliably supported by all MySQL-compatible proxies (VIP, ProxySQL, etc.).
  // Protection comes from the SELECT-only regex above and mysql2's default
  // single-statement mode (multipleStatements: false).
  const client = await pool.getConnection();
  const start = Date.now();
  try {
    const [rows] = await client.query(trimmed);
    const duration_ms = Date.now() - start;
    res.json({ rows, count: (rows as any[]).length, duration_ms });
  } catch (err: any) {
    console.error('[query] SQL error:', err.message);
    res.status(400).json({ error: 'Query failed. Check your SQL syntax and try again.' });
  } finally {
    client.release();
  }
});

export default router;
