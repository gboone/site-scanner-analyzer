import * as fs from 'fs';
import * as path from 'path';

// Load .env from project root
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  dbPath: process.env.DB_PATH || './data/scanner.db',
  gsaApiKey: process.env.GSA_API_KEY || '',
  gleanApiKey: process.env.GLEAN_API_KEY || '',
  gleanEndpoint: process.env.GLEAN_ENDPOINT || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
};
