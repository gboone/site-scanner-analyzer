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
import { apiKeysRouter } from './routes/api-keys';
import { mcpRouter } from './mcp/server';
import { setupScheduler, shutdown as shutdownScheduler } from './scheduler';
import { buildSchemaResponse } from './apiRegistry';
import { ipAllowlistGate, findMalformedEntries } from './middleware/ipAllowlist';
import { apiTokenGate, mcpAuthGate } from './middleware/apiToken';

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
  app.use('/api/v1/api-keys',       apiKeysRouter);
  app.use('/agent',                 agentRouter);
  app.use('/mcp',                   mcpAuthGate, mcpRouter);

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
    res.json({ ok: true, version: buildSchemaResponse().info.version });
  });

  // ---------------------------------------------------------------------------
  // 5. Schema — machine-readable directory of every mounted API route, driven
  //    by server/src/apiRegistry.ts (also used for Glean agent tool definitions
  //    and for the `meta.related` links on individual endpoint responses).
  // ---------------------------------------------------------------------------
  app.get('/api/v1/schema', (_req, res) => {
    res.json(buildSchemaResponse());
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
  // Both access-control gates only enforce when NODE_ENV === 'production' exactly (never touch
  // this on a mere typo/misconfiguration risk — local dev relies on it being unset). Logging the
  // resolved value makes a misconfigured production deploy (NODE_ENV unset or misspelled, which
  // would silently fail-open) visible in startup logs without changing gating behavior.
  console.log(`  - NODE_ENV: ${process.env.NODE_ENV || '(unset)'}${process.env.NODE_ENV !== 'production' ? ' — access-control gates are BYPASSED' : ''}`);
  if (process.env.NODE_ENV === 'production' && config.automatticNetworkCidrs.length === 0) {
    console.warn(
      '  - ⚠ AUTOMATTIC_NETWORK_CIDRS is empty: the Automattic-network bypass in ipAllowlistGate/apiTokenGate ' +
      'is a no-op until VIP Support supplies real CIDR ranges. Do not disable the VIP Dashboard IP Allow List ' +
      'until this is populated or the gap is consciously accepted — see docs/adr/0001-app-level-access-control.md.'
    );
  }
  if (process.env.NODE_ENV === 'production' && config.allowedIps.length === 0) {
    console.warn(
      '  - ⚠ ALLOWED_IPS is empty: ipAllowlistGate will 403 every request to the UI/static SPA from every IP. ' +
      'Set the real allowed-IP list before relying on this in production — see docs/adr/0001-app-level-access-control.md.'
    );
  }
  if (process.env.NODE_ENV === 'production' && !config.scannerApiToken) {
    console.warn(
      '  - ⚠ SCANNER_API_TOKEN is empty: apiTokenGate will 401 every /api/v1/* request from outside ALLOWED_IPS, ' +
      'including this app\'s own in-app Chat feature (claude-chat.ts calls /api/v1/* over loopback with this token). ' +
      'Set a real token before relying on this in production — see docs/adr/0001-app-level-access-control.md.'
    );
  }
  const malformedAllowedIps = findMalformedEntries(config.allowedIps);
  const malformedAutomatticCidrs = findMalformedEntries(config.automatticNetworkCidrs);
  if (malformedAllowedIps.length > 0) {
    console.warn(`  - ⚠ ALLOWED_IPS has entries that don't parse as an IP/CIDR and will never match: ${malformedAllowedIps.join(', ')}`);
  }
  if (malformedAutomatticCidrs.length > 0) {
    console.warn(`  - ⚠ AUTOMATTIC_NETWORK_CIDRS has entries that don't parse as an IP/CIDR and will never match: ${malformedAutomatticCidrs.join(', ')}`);
  }
  console.log('✓ Startup complete — all routes active');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
