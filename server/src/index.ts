import './config'; // Load env first
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initDb } from './db';

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

// Middleware
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
app.use(express.json({ limit: '50mb' })); // Large JSON imports

// Routes
app.use('/api/v1/import', importRouter);
app.use('/api/v1/sites', sitesRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/query', queryRouter);
app.use('/api/v1/scans', scansRouter);
app.use('/api/v1/proxy', proxyRouter);
app.use('/api/v1/gsa', gsaRouter);
app.use('/api/v1/briefings', briefingsRouter);
app.use('/api/v1/agencies', agenciesRouter);
app.use('/api/v1/bureaus', bureausRouter);

// Settings endpoint (simple key/value store)
app.get('/api/v1/settings', (_req, res) => {
  const { sqlite } = require('./db');
  const rows = sqlite.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of rows as any[]) settings[row.key] = row.value;
  res.json(settings);
});

app.put('/api/v1/settings/:key', (req, res) => {
  const { sqlite } = require('./db');
  const { key } = req.params;
  const { value } = req.body;
  sqlite.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(key, value);
  // Also update process.env so the running config picks it up immediately (no restart needed)
  process.env[String(key)] = value;
  // Sync into the live config object
  const configMap: Record<string, keyof typeof config> = {
    GSA_API_KEY: 'gsaApiKey',
    GLEAN_API_KEY: 'gleanApiKey',
    GLEAN_ENDPOINT: 'gleanEndpoint',
    ANTHROPIC_API_KEY: 'anthropicApiKey',
  };
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

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true, version: '1.0.0' });
});

// Initialize DB and start
initDb();

// Load any settings previously saved via the UI into the live config object.
// This ensures keys saved in a previous session are available without a .env edit.
{
  const { sqlite } = require('./db');
  const configMap: Record<string, keyof typeof config> = {
    GSA_API_KEY: 'gsaApiKey',
    GLEAN_API_KEY: 'gleanApiKey',
    GLEAN_ENDPOINT: 'gleanEndpoint',
    ANTHROPIC_API_KEY: 'anthropicApiKey',
  };
  const rows = sqlite.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  for (const row of rows) {
    // .env takes precedence — only apply DB value if .env didn't already set it
    const configKey = configMap[row.key];
    if (configKey && !process.env[row.key] && row.value) {
      (config as any)[configKey] = row.value;
      process.env[row.key] = row.value;
    }
  }
}

app.listen(config.port, () => {
  console.log(`✓ Server running at http://localhost:${config.port}`);
  console.log(`  - Glean: ${config.gleanEndpoint ? '✓ configured' : '✗ not configured'}`);
  console.log(`  - GSA API: ${config.gsaApiKey ? '✓ configured' : '✗ not configured'}`);
});
