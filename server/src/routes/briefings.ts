import { Router, Request, Response } from 'express';
import { sqlite } from '../db';
import { config } from '../config';

const router = Router();

// GET /api/v1/briefings/export/:id — registered BEFORE /:domain to prevent "export" matching as a domain name
router.get('/export/:id', (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const briefing = sqlite.prepare('SELECT * FROM briefings WHERE id = ?').get(id) as any;
  if (!briefing) {
    res.status(404).json({ error: 'Briefing not found' });
    return;
  }
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="briefing-${briefing.domain}-${briefing.created_at.slice(0,10)}.md"`);
  res.send(briefing.full_markdown || '# No content');
});

// GET /api/v1/briefings/:domain
router.get('/:domain', (req: Request, res: Response) => {
  const domain = decodeURIComponent(String(req.params.domain));
  const briefings = sqlite.prepare(
    'SELECT * FROM briefings WHERE domain = ? ORDER BY created_at DESC'
  ).all(domain);
  res.json(briefings);
});

// POST /api/v1/briefings - generate a new briefing
router.post('/', async (req: Request, res: Response) => {
  const { domain, provider = 'glean', scope } = req.body as {
    domain: string;
    provider?: 'glean' | 'claude';
    scope?: string;
  };

  if (!domain) {
    res.status(400).json({ error: 'domain is required' });
    return;
  }

  const site = sqlite.prepare('SELECT * FROM sites WHERE domain = ?').get(domain) as any;
  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }

  if (provider === 'glean' && (!config.gleanApiKey || !config.gleanEndpoint)) {
    res.status(400).json({ error: 'Glean API key and endpoint must be configured in Settings' });
    return;
  }

  if (provider === 'claude' && !config.anthropicApiKey) {
    res.status(400).json({ error: 'Anthropic API key must be configured in Settings' });
    return;
  }

  const start = Date.now();
  const now = new Date().toISOString();

  try {
    let result: any;
    if (provider === 'glean') {
      const { generateGleanBriefing } = await import('../services/glean');
      result = await generateGleanBriefing(site, scope);
    } else {
      const { generateClaudeBriefing } = await import('../services/claude');
      result = await generateClaudeBriefing(site, scope);
    }

    const duration_ms = Date.now() - start;

    // Verify references
    const verifiedRefs = await verifyReferences(result.references || []);

    // Parse sections from full markdown
    const sections = parseSections(result.full_markdown || '');

    const insertId = sqlite.prepare(`
      INSERT INTO briefings (domain, created_at, provider, model, agency_identity, website_purpose,
        policy_objectives, recent_milestones, website_role, references_json, full_markdown,
        prompt_tokens, completion_tokens, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      domain, now, provider, result.model || null,
      sections.agency_identity || null,
      sections.website_purpose || null,
      sections.policy_objectives || null,
      sections.recent_milestones || null,
      sections.website_role || null,
      JSON.stringify(verifiedRefs),
      result.full_markdown || null,
      result.prompt_tokens || null,
      result.completion_tokens || null,
      duration_ms,
    ).lastInsertRowid;

    const briefing = sqlite.prepare('SELECT * FROM briefings WHERE id = ?').get(insertId);
    res.json(briefing);

  } catch (err: any) {
    res.status(500).json({ error: `Briefing generation failed: ${err.message}` });
  }
});

async function verifyReferences(refs: Array<{title: string; url: string; description?: string}>) {
  const { default: fetch } = await import('node-fetch');
  return Promise.all(refs.map(async (ref) => {
    try {
      const resp = await fetch(ref.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'GSA-Site-Scanner-Analyzer/1.0' },
      });
      return { ...ref, verified: resp.ok, status: resp.status };
    } catch {
      return { ...ref, verified: false, status: null };
    }
  }));
}

function parseSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const sectionMap: Record<string, string> = {
    'agency': 'agency_identity',
    'bureau': 'agency_identity',
    'identity': 'agency_identity',
    'purpose': 'website_purpose',
    'service delivery': 'website_purpose',
    'policy': 'policy_objectives',
    'ffy': 'policy_objectives',
    'milestones': 'recent_milestones',
    'recent': 'recent_milestones',
    'role': 'website_role',
  };

  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  const parts = markdown.split(headingRegex);

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].toLowerCase();
    const content = parts[i + 1]?.trim() || '';
    for (const [keyword, field] of Object.entries(sectionMap)) {
      if (heading.includes(keyword) && !sections[field]) {
        sections[field] = `### ${parts[i]}\n\n${content}`;
        break;
      }
    }
  }

  return sections;
}

export default router;
