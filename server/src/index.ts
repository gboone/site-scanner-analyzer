import './config'; // Load env first
import path from 'path';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { query, execute, initDb } from './db';

import importRouter from './routes/import';
import sitesRouter from './routes/sites';
import statsRouter from './routes/stats';
import queryRouter from './routes/query';
import scansRouter from './routes/scans';
import proxyRouter from './routes/proxy';
import gsaRouter from './routes/gsa';
import briefingsRouter from './routes/briefings';
import { agenciesRouter, bureausRouter } from './routes/agencies';

const app = express();

async function main() {
  // Initialize DB first — all routes depend on the schema being present
  await initDb();

  // Load any settings previously saved via the UI into the live config object.
  // This ensures keys saved in a previous session are available without a .env edit.
  // (.env values take precedence — only apply DB value if .env didn't already set it.)
  const configMap: Record<string, keyof typeof config> = {
    GSA_API_KEY:       'gsaApiKey',
    GLEAN_API_KEY:     'gleanApiKey',
    GLEAN_ENDPOINT:    'gleanEndpoint',
    ANTHROPIC_API_KEY: 'anthropicApiKey',
  };
  const savedSettings = await query<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  for (const row of savedSettings) {
    const configKey = configMap[row.key];
    if (configKey && !process.env[row.key] && row.value) {
      (config as any)[configKey] = row.value;
      process.env[row.key] = row.value;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Health check — MUST come before auth so VIP's checker (no credentials)
  //    always gets a 200. VIP serves 503 to all users if this returns non-200.
  // ---------------------------------------------------------------------------
  app.get('/cache-healthcheck', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---------------------------------------------------------------------------
  // 2. HTTP Basic Auth (optional) — set AUTH_PASSWORD to enable; omit in dev
  // ---------------------------------------------------------------------------
  if (process.env.AUTH_PASSWORD) {
    const authUser = process.env.AUTH_USER ?? 'admin';
    const authPass = process.env.AUTH_PASSWORD;
    app.use((req, res, next) => {
      const header = req.headers.authorization ?? '';
      if (header.startsWith('Basic ')) {
        const decoded = Buffer.from(header.slice(6), 'base64').toString();
        const colon   = decoded.indexOf(':');
        if (
          colon > 0 &&
          decoded.slice(0, colon)  === authUser &&
          decoded.slice(colon + 1) === authPass
        ) {
          return next();
        }
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="Site Scanner", charset="UTF-8"');
      res.status(401).send('Unauthorized');
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Shared middleware
  // ---------------------------------------------------------------------------
  // CORS: env var in production (VIP), localhost fallback for dev
  const corsOrigin = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN
    : /^http:\/\/localhost(:\d+)?$/;
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '50mb' })); // Large JSON imports

  // ---------------------------------------------------------------------------
  // 4. API routes
  // ---------------------------------------------------------------------------
  app.use('/api/v1/import',    importRouter);
  app.use('/api/v1/sites',     sitesRouter);
  app.use('/api/v1/stats',     statsRouter);
  app.use('/api/v1/query',     queryRouter);
  app.use('/api/v1/scans',     scansRouter);
  app.use('/api/v1/proxy',     proxyRouter);
  app.use('/api/v1/gsa',       gsaRouter);
  app.use('/api/v1/briefings', briefingsRouter);
  app.use('/api/v1/agencies',  agenciesRouter);
  app.use('/api/v1/bureaus',   bureausRouter);

  // Settings endpoint (simple key/value store)
  app.get('/api/v1/settings', async (_req, res) => {
    const rows = await query<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  });

  app.put('/api/v1/settings/:key', async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    await execute(
      `INSERT INTO settings (key, value)
       VALUES (:key, :value)
       ON CONFLICT (key) DO UPDATE SET
         value      = EXCLUDED.value,
         updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      { key, value }
    );
    // Also update process.env so the running config picks it up immediately
    process.env[String(key)] = value;
    // Sync into the live config object
    const configKey = configMap[String(key)];
    if (configKey) (config as any)[configKey] = value;
    res.json({ ok: true });
  });

  app.get('/api/v1/settings/test-glean', async (_req, res) => {
    if (!config.gleanEndpoint || !config.gleanApiKey) {
      res.json({ connected: false, reason: 'Glean endpoint and API key not configured' });
      return;
    }
    try {
      const { default: fetch } = await import('node-fetch');
      const response = await fetch(config.gleanEndpoint, {
        headers: { 'Authorization': `Bearer ${config.gleanApiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      res.json({ connected: response.status < 500, status: response.status });
    } catch (err: any) {
      res.json({ connected: false, reason: err.message });
    }
  });

  // Health check (legacy — keep for existing clients)
  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, version: '1.0.0' });
  });

  // ---------------------------------------------------------------------------
  // 5. Static SPA — production only, MUST come after all API routes
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // ---------------------------------------------------------------------------
  // 6. Start
  // ---------------------------------------------------------------------------
  app.listen(config.port, () => {
    console.log(`✓ Server running at http://localhost:${config.port}`);
    console.log(`  - Glean: ${config.gleanEndpoint ? '✓ configured' : '✗ not configured'}`);
    console.log(`  - GSA API: ${config.gsaApiKey ? '✓ configured' : '✗ not configured'}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
