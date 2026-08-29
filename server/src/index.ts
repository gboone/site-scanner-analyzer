import './config'; // Load env first
import path from 'path';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { query, execute, initDb } from './db';

import sitesRouter from './routes/sites';
import statsRouter from './routes/stats';
import queryRouter from './routes/query';
import scansRouter from './routes/scans';
import proxyRouter from './routes/proxy';
import gsaRouter    from './routes/gsa';
import getgovRouter from './routes/getgov';
import briefingsRouter from './routes/briefings';
import scanSessionsRouter from './routes/scan-sessions';
import { agenciesRouter, bureausRouter } from './routes/agencies';
import reportRouter from './routes/report';
import schedulerRouter from './routes/scheduler';
import agentRouter from './routes/agent';
import { chatRouter, modelsRouter } from './routes/chat';
import { setupScheduler, shutdown as shutdownScheduler } from './scheduler';
import { ipAllowlistGate } from './middleware/ipAllowlist';
import { apiTokenGate } from './middleware/apiToken';

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
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Start accepting connections NOW, before initDb() runs. Express registers
  // middleware/routes in order at request time, so everything registered below
  // still takes full effect — we're just ensuring the port is open early so
  // VIP's health probe doesn't time out while the schema migration runs.
  const server = await new Promise<import('http').Server>((resolve, reject) => {
    const s = app.listen(config.port, () => resolve(s)).on('error', reject);
  });
  console.log(`✓ Server listening at http://localhost:${config.port}`);

  // Graceful shutdown — VIP sends SIGTERM before replacing the container.
  // Stop scheduler jobs, drain in-flight requests, then exit cleanly.
  const gracefulShutdown = (signal: string) => {
    console.log(`[shutdown] ${signal} received — shutting down gracefully`);
    shutdownScheduler();
    server.close(() => {
      console.log('[shutdown] HTTP server closed');
      process.exit(0);
    });
    // Force exit if drain takes too long (VIP typically allows ~30 s)
    setTimeout(() => {
      console.error('[shutdown] Forced exit after timeout');
      process.exit(1);
    }, 25_000).unref();
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

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

  // ---------------------------------------------------------------------------
  // Load any settings previously saved via the UI into the live config object.
  // This ensures keys saved in a previous session are available without a .env edit.
  // (.env values take precedence — only apply DB value if .env didn't already set it.)
  const configMap: Record<string, keyof typeof config> = {
    GSA_API_KEY:       'gsaApiKey',
    ANTHROPIC_API_KEY: 'anthropicApiKey',
    ANTHROPIC_MODEL:   'anthropicModel',
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

  // Path-scoped access control (see docs/adr/0001-app-level-access-control.md):
  // ipAllowlistGate is mounted globally but exempts /api/v1 and /agent
  // internally, since those have their own gate (or are deliberately open).
  // apiTokenGate is scoped to /api/v1 and admits an already-allowed IP
  // without a token (dual-path) so the SPA's own browser calls keep working.
  app.use(ipAllowlistGate);
  app.use('/api/v1', apiTokenGate);

  // ---------------------------------------------------------------------------
  // 4. API routes
  // ---------------------------------------------------------------------------
  app.use('/api/v1/sites',     sitesRouter);
  app.use('/api/v1/stats',     statsRouter);
  app.use('/api/v1/query',     queryRouter);
  app.use('/api/v1/scans',     scansRouter);
  app.use('/api/v1/proxy',     proxyRouter);
  app.use('/api/v1/gsa',       gsaRouter);
  app.use('/api/v1/getgov',   getgovRouter);
  app.use('/api/v1/briefings',      briefingsRouter);
  app.use('/api/v1/scan-sessions',  scanSessionsRouter);
  app.use('/api/v1/agencies',       agenciesRouter);
  app.use('/api/v1/bureaus',        bureausRouter);
  app.use('/api/v1/report',         reportRouter);
  app.use('/api/v1/scheduler',      schedulerRouter);
  app.use('/api/v1/chat',           chatRouter);
  app.use('/api/v1/models',         modelsRouter);
  app.use('/agent',                 agentRouter);

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

  // Health check (legacy — keep for existing clients)
  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, version: '1.0.0' });
  });

  // ---------------------------------------------------------------------------
  // 5. Schema — machine-readable description for Glean agent tool definitions
  // ---------------------------------------------------------------------------
  app.get('/api/v1/schema', (_req, res) => {
    res.json({
      info: {
        title: 'Site Scan Analyzer API',
        description: 'Federal government website scan data. Use /api/v1/report to retrieve public website data for any agency or bureau by name.',
        version: '1.0.0',
      },
      endpoints: {
        'GET /healthz': {
          description: 'Liveness check.',
          response: { status: 'ok' },
        },
        'GET /api/v1/report': {
          description: 'Resolve an agency or bureau name (exact or shorthand) and return its public website data. Returns disambiguation candidates when the query is ambiguous.',
          parameters: {
            q: { type: 'string', required: true, description: "Agency or bureau name, exact or partial (e.g. 'HHS', 'NOAA', 'Centers for Medicare and Medicaid Services')" },
          },
          responses: {
            '200_resolved': {
              needs_disambiguation: false,
              matched_as: "'agency' | 'bureau'",
              matched_name: 'string — canonical name as stored in the database',
              parent_agency: 'string | null — populated when matched_as is bureau',
              total_public_sites: 'number',
              summary: {
                total_public_sites: 'number',
                live_count: 'number — sites returning HTTP 200',
                uswds_count: 'number — sites with U.S. Web Design System detected',
                dap_count: 'number — sites with Digital Analytics Program tag',
                https_enforced_count: 'number — sites enforcing HTTPS',
                sitemap_detected_count: 'number — sites with sitemap.xml',
              },
              sites: [{
                domain: 'string',
                url: 'string | null',
                title: 'string | null',
                description: 'string | null',
                cms: 'string | null — detected content management system',
                uswds_count: 'number | null — USWDS signal count (higher = more confident)',
                uswds_version: 'number | null',
                uswds_semantic_version: 'string | null',
                dap: '0 | 1 | null',
                dap_version: 'string | null',
                https_enforced: '0 | 1 | null',
                sitemap_xml_detected: '0 | 1 | null',
                security_header_csp: 'string | null — Content-Security-Policy header value',
                updated_at: 'string — ISO 8601 timestamp of last scan',
              }],
            },
            '200_disambiguation': {
              needs_disambiguation: true,
              query: 'string',
              candidates: [{
                type: "'agency' | 'bureau'",
                name: 'string',
                parent_agency: 'string | null',
                site_count: 'number',
                score: 'number',
              }],
            },
            '400': { error: 'string — validation message' },
            '404': { error: 'string', query: 'string' },
            '500': { error: 'string' },
          },
        },
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Global JSON error handler — catches any unhandled next(err) or throws
  // ---------------------------------------------------------------------------
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[unhandled error]', err?.message ?? err, err?.stack);
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({ error: err?.message ?? 'Internal server error' });
  });

  // ---------------------------------------------------------------------------
  // 7. Static SPA — production only, MUST come after all API routes
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // ---------------------------------------------------------------------------
  // 6. Ready
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 7b. Scheduler — start background jobs after routes are registered
  // ---------------------------------------------------------------------------
  await setupScheduler();

  console.log(`  - GSA API: ${config.gsaApiKey ? '✓ configured' : '✗ not configured'}`);
  if (process.env.NODE_ENV === 'production' && config.automatticNetworkCidrs.length === 0) {
    console.warn(
      '  - ⚠ AUTOMATTIC_NETWORK_CIDRS is empty: the Automattic-network bypass in ipAllowlistGate/apiTokenGate ' +
      'is a no-op until VIP Support supplies real CIDR ranges. Do not disable the VIP Dashboard IP Allow List ' +
      'until this is populated or the gap is consciously accepted — see docs/adr/0001-app-level-access-control.md.'
    );
  }
  console.log('✓ Startup complete — all routes active');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
