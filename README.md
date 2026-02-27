# GSA Site Scanner Analyzer

A local-first web application for exploring, re-scanning, and researching GSA Site Scanner data. Designed around a 343-site VA.gov dataset but works with any Site Scanner JSON export.

## Features

- **Explorer** — Filterable, sortable data table with 10 columns and per-site detail panel
- **SQL Interface** — Full SQLite query editor with syntax highlighting, query history, and sample queries
- **Dashboard** — Recharts visualizations: USWDS adoption, sitemap health, third-party domains, bureau breakdown
- **Re-scan** — Live scanner that re-checks any site and diffs results against the stored record
- **Deep Research** — Glean or Claude-powered agency briefings with verified references and Markdown export

## Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later

## Setup

```bash
# 1. Install all dependencies (root + workspaces)
npm install

# 2. Copy the env template and fill in your keys
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Required | Description |
|---|---|---|
| `GLEAN_ENDPOINT` | For Glean briefings | Your Glean instance URL (e.g. `https://myorg-be.glean.com/api/v1`) |
| `GLEAN_API_KEY` | For Glean briefings | Glean API token |
| `ANTHROPIC_API_KEY` | For Claude briefings | Anthropic API key |
| `GSA_API_KEY` | For live GSA data | api.data.gov key (free at api.data.gov/signup) |
| `PORT` | No (default: 3001) | Server port |

## Start

```bash
npm start
```

This runs the Express server (port 3001) and Vite dev server (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173).

## Import Data

**Option A — Drag and drop**: Drop a GSA Site Scanner JSON file anywhere on the app.

**Option B — GSA API**: Go to Settings, enter your GSA API key, then use the "Fetch from GSA API" button.

The importer upserts records — re-importing updates existing rows.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Jump to Explorer and focus search |
| `⌘/` / `Ctrl+/` | Jump to SQL editor |
| `Escape` | Close site detail panel |
| `⌘↵` / `Ctrl+↵` | Run SQL query (inside the editor) |

## Re-scanning Sites

1. Click any row in Explorer to open the detail panel
2. Go to the **Overview** tab and click **Re-scan**
3. The scanner runs redirect chain, sitemap, robots.txt, tech detection, and DNS checks
4. Results diff against the stored record and are saved to `scan_history`

Re-scan results are applied to the live `sites` table immediately.

## Deep Research (Briefings)

1. Open a site's detail panel → **Research** tab
2. Select provider (Glean or Claude) and optionally provide a focus area
3. Click **Generate Briefing** — this takes 30–90 seconds
4. The briefing is stored and can be exported as Markdown or printed as PDF

Requires `GLEAN_API_KEY` + `GLEAN_ENDPOINT` (for Glean) or `ANTHROPIC_API_KEY` (for Claude) in `.env`.

## SQL Tips

The query engine runs against the local SQLite database. All 97 GSA fields are available. Array fields (e.g. `third_party_service_domains`) are stored as JSON and queryable with `json_each()`:

```sql
-- Third-party domains appearing on 5+ sites
SELECT value AS domain, COUNT(DISTINCT s.domain) AS sites
FROM sites s, json_each(s.third_party_service_domains)
GROUP BY value
HAVING sites >= 5
ORDER BY sites DESC;

-- USWDS adoption rate by bureau
SELECT bureau,
       COUNT(*) AS total,
       ROUND(100.0 * SUM(CASE WHEN uswds_count > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS uswds_pct
FROM sites
GROUP BY bureau
ORDER BY uswds_pct DESC;
```

Only `SELECT` queries are permitted. `DROP`, `DELETE`, `INSERT`, `UPDATE`, etc. are blocked.

## Development Notes

| Component | Details |
|---|---|
| Server | Express on `localhost:3001`, TypeScript via `tsx watch` |
| Client | Vite on `localhost:5173`, proxies `/api` → server |
| Database | SQLite at `server/data/scanner.db` |
| Migrations | `npm run db:migrate --workspace=server` |
| Schema | `server/src/db/schema.ts` |
| Scanner modules | `client/src/scanner/` (ported from wp-analyze) |

## Project Structure

```
site-scanner-analyzer/
├── client/          React + TypeScript + Vite frontend
├── server/          Express + SQLite backend
├── shared/          Shared TypeScript types
└── .env             API keys (not committed)
```
