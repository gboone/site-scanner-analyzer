import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// GET /api/v1/briefings/export/:id — registered BEFORE /:domain to prevent "export" matching as a domain name
router.get('/export/:id', async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const briefing = (await query<any>('SELECT * FROM briefings WHERE id = ?', [id]))[0];
  if (!briefing) {
    res.status(404).json({ error: 'Briefing not found' });
    return;
  }
  const safeDomain = String(briefing.domain).replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeDate = String(briefing.created_at).slice(0, 10).replace(/[^0-9-]/g, '');
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="briefing-${safeDomain}-${safeDate}.md"`);
  res.send(briefing.full_markdown || '# No content');
});

// GET /api/v1/briefings/:domain
router.get('/:domain', async (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const briefings = await query(
    'SELECT * FROM briefings WHERE domain = ? ORDER BY created_at DESC',
    [domain]
  );
  res.json(briefings);
});

// POST /api/v1/briefings - AI briefing generation has been removed
router.post('/', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'AI briefing generation has been removed.' });
});

export default router;
