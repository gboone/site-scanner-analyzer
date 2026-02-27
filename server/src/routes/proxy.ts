import { Router, Request, Response } from 'express';
import { ssrfProtection } from '../middleware/ssrf-protection';

const router = Router();

// Apply SSRF protection to all proxy requests
router.post('/', ssrfProtection, async (req: Request, res: Response) => {
  const { url, method = 'GET', headers: reqHeaders = {} } = req.body as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  };

  const allowedMethods = ['GET', 'HEAD'];
  if (!allowedMethods.includes(method.toUpperCase())) {
    res.status(400).json({ error: 'Only GET and HEAD methods are allowed' });
    return;
  }

  try {
    const { default: fetch } = await import('node-fetch');

    const safeHeaders: Record<string, string> = {
      'User-Agent': 'GSA-Site-Scanner-Analyzer/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    // Only forward safe request headers
    const SAFE_HEADERS = ['accept', 'accept-language', 'cache-control'];
    for (const [k, v] of Object.entries(reqHeaders)) {
      if (SAFE_HEADERS.includes(k.toLowerCase())) safeHeaders[k] = v;
    }

    const fetchRes = await fetch(url, {
      method: method.toUpperCase(),
      headers: safeHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });

    const responseHeaders: Record<string, string> = {};
    fetchRes.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let body = '';
    if (method.toUpperCase() === 'GET') {
      const buffer = await fetchRes.arrayBuffer();
      body = Buffer.from(buffer).toString('utf-8');
    }

    res.json({
      success: true,
      status: fetchRes.status,
      headers: responseHeaders,
      body,
      redirected: fetchRes.status >= 300 && fetchRes.status < 400,
      location: responseHeaders['location'] || null,
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
      res.status(504).json({ success: false, error: 'Request timed out' });
    } else {
      res.status(502).json({ success: false, error: err.message });
    }
  }
});

export default router;
