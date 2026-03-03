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
import scanSessionsRouter from './routes/scan-sessions';
import { agenciesRouter, bureausRouter } from './routes/agencies';
import { validateUrlForSsrf } from './middleware/ssrf-protection';

const app = express();

async function main() {
  // ---------------------------------------------------------------------------
  // 1. Health check + early listen — registered before ANY async work so VIP's
  //    probe gets a 200 immediately. VIP serves 503 to all users if this returns
  //    non-200, and it will declare the deploy "crashed" if the port isn't
  //    accepting connections within its startup window.
  // ---------------------------------------------------------------------------
  app.get('/cache-healthcheck', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Start accepting connections NOW, before initDb() runs. Express registers
  // middleware/routes in order at request time, so everything registered below
  // still takes full effect — we're just ensuring the port is open early so
  // VIP's health probe doesn't time out while the schema migration runs.
  await new Promise<void>((resolve, reject) => {
    app.listen(config.port, () => resolve()).on('error', reject);
  });
  console.log(`✓ Server listening at http://localhost:${config.port}`);

  // ---------------------------------------------------------------------------
  // 2. Initialize DB — runs after server is already accepting health checks.
  //    Retries on ECONNREFUSED / ECONNRESET because VIP's ProxySQL sidecar may
  //    not be ready the instant the Node process starts.  We wait up to ~30 s
  //    (10 attempts × 3 s) before giving up and crashing.
  // ---------------------------------------------------------------------------
  {
    const CONNECTION_ERRORS = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH']);
    const MAX_ATTEMPTS = 10;
    const RETRY_DELAY_MS = 3000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await initDb();
        break; // success — exit the retry loop
      } catch (err: any) {
        const isConnErr = CONNECTION_ERRORS.has(err.code) || err.errno === -111;
        if (!isConnErr || attempt === MAX_ATTEMPTS) throw err;
        console.log(
          `  DB not ready yet (${err.code ?? err.errno}, attempt ${attempt}/${MAX_ATTEMPTS})` +
          ` — retrying in ${RETRY_DELAY_MS / 1000} s…`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

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
    'SELECT `key`, value FROM settings'
  );
  for (const row of savedSettings) {
    const configKey = configMap[row.key];
    if (configKey && !process.env[row.key] && row.value) {
      (config as any)[configKey] = row.value;
      process.env[row.key] = row.value;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. HTTP Basic Auth (optional) — set AUTH_PASSWORD to enable; omit in dev
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
  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

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
  app.use('/api/v1/briefings',      briefingsRouter);
  app.use('/api/v1/scan-sessions',  scanSessionsRouter);
  app.use('/api/v1/agencies',       agenciesRouter);
  app.use('/api/v1/bureaus',        bureausRouter);

  // Settings endpoint (simple key/value store)
  app.get('/api/v1/settings', async (_req, res) => {
    const rows = await query<{ key: string; value: string }>(
      'SELECT `key`, value FROM settings'
    );
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  });

  app.put('/api/v1/settings/:key', async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    // Only allow the keys that map to known config values — reject anything else.
    if (!configMap[key]) {
      res.status(400).json({ error: `Unknown setting key: ${key}` });
      return;
    }
    await execute(
      `INSERT INTO settings (\`key\`, value)
       VALUES (:key, :value)
       ON DUPLICATE KEY UPDATE
         value      = VALUES(value),
         updated_at = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%SZ')`,
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
    // Guard against SSRF — the endpoint URL may have been set via the settings UI,
    // not just env vars, so we must validate it before fetching.
    const ssrfError = await validateUrlForSsrf(config.gleanEndpoint);
    if (ssrfError) {
      res.status(403).json({ connected: false, reason: ssrfError });
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
  // 6. Ready
  // ---------------------------------------------------------------------------
  console.log(`  - Glean: ${config.gleanEndpoint ? '✓ configured' : '✗ not configured'}`);
  console.log(`  - GSA API: ${config.gsaApiKey ? '✓ configured' : '✗ not configured'}`);
  console.log('✓ Startup complete — all routes active');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
