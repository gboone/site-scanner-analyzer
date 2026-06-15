# GSA Site Scan Analyzer

A local-first web application for exploring, re-scanning, and researching GSA Site Scanner data. Designed around a 343-site VA.gov dataset but works with any Site Scanner JSON export.

## Features

- **Explorer** — Filterable, sortable data table with per-site detail panel and bulk re-scan
- **SQL Interface** — Full MySQL query editor with syntax highlighting, query history, and sample queries
- **Dashboard** — Recharts visualizations: USWDS adoption, sitemap health, third-party domains, bureau breakdown
- **Re-scan** — Live scanner that re-checks any site and diffs results against the stored record
- **Scan sessions** — Bulk scans persist across page navigation; the sidebar shows live progress and Explorer logs a full scan history
- **Deep Research** — Glean or Claude-powered agency briefings with verified references and Markdown export

---

## Prerequisites

- **Node.js** 24 or later (`node --version`)
- **npm** 10 or later (`npm --version`)
- **MySQL 8.0** — easiest via Docker (see below), but a local install works too
- **Docker** (optional but recommended for the database)

---

## Local setup

### 1. Clone the repo

```bash
git clone <repo-url> site-scanner-analyzer
cd site-scanner-analyzer
```

### 2. Start MySQL

**With Docker (recommended):**

A `docker-compose.yml` is included. It starts MySQL 8.0 on the default port with a `scanner` database:

```bash
docker compose up -d db
```

This creates a named volume (`mysql_data`) so your data persists across restarts. To stop the container without destroying data:

```bash
docker compose stop db
```

To tear it down completely (data included):

```bash
docker compose down -v
```

**Without Docker (local MySQL install):**

If you'd rather run MySQL directly, create the database manually after installation:

```sql
CREATE DATABASE scanner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum the database block. If you used the Docker setup above, these values work as-is:

```env
VIP_MARIADB_USER=root
VIP_MARIADB_PASSWORD=scanner
VIP_MARIADB_NAME=scanner
VIP_MARIADB_WRITE_HOSTS=127.0.0.1:3306
```

Full variable reference:

| Variable | Required | Description |
|---|---|---|
| `VIP_MARIADB_WRITE_HOSTS` | **Yes** | MySQL host and port, e.g. `127.0.0.1:3306` |
| `VIP_MARIADB_USER` | **Yes** | MySQL username |
| `VIP_MARIADB_PASSWORD` | **Yes** | MySQL password |
| `VIP_MARIADB_NAME` | **Yes** | Database name (e.g. `scanner`) |
| `GSA_API_KEY` | For live GSA data | Free key at [api.data.gov/signup](https://api.data.gov/signup) |
| `GLEAN_API_KEY` | For Glean briefings | Glean API token |
| `GLEAN_ENDPOINT` | For Glean briefings | Your Glean instance URL |
| `ANTHROPIC_API_KEY` | For Claude briefings | Anthropic API key |
| `AUTH_PASSWORD` | Production only | Enables HTTP Basic Auth; omit in dev |
| `PORT` | No (default: `3001`) | Server port |

### 4. Install dependencies

```bash
npm install
```

This installs packages for all three workspaces (`server`, `client`, `shared`) in one shot.

### 5. Start the dev servers

```bash
npm run dev
```

This runs two processes concurrently:

| Process | URL | What it does |
|---|---|---|
| Express server | `http://localhost:3001` | API, DB access, scanner proxy |
| Vite dev server | `http://localhost:5173` | React frontend, proxies `/api` → server |

**On first start**, the server automatically creates all tables (`sites`, `scan_history`, `briefings`, `scan_sessions`, `settings`) if they don't exist. No separate migration step is needed.

Open [http://localhost:5173](http://localhost:5173) — you'll see an empty Explorer until you import data.

---

## Import data

### Option A — Drag and drop

Drop any GSA Site Scanner JSON export onto the app (anywhere on the page). The importer upserts records: re-importing updates existing rows, it doesn't duplicate them.

### Option B — GSA API

Go to **Settings**, enter your `GSA_API_KEY`, choose an agency filter if you want, then click **Fetch from GSA API**.

### Option C — Domain list + scan

Click **+ Add domains** in Explorer, paste a list of domains (one per line or comma-separated, or drop a `.txt` file), then click **Scan & import**. Each domain is scanned live and added to the corpus. You can close the dialog and the scan continues running in the background — watch the sidebar for progress.

---

## Re-scanning sites

### Single site

1. Click any row in Explorer to open the detail panel
2. Go to the **Overview** tab → **Re-scan**
3. The scanner runs redirect chain, sitemap, robots.txt, tech detection, and DNS checks
4. Results are diffed against the stored record and saved to `scan_history`

### Bulk re-scan

1. Select rows using the checkboxes in Explorer (or **Select all matching** to grab up to 1,000 rows)
2. Click **🔄 Rescan selected**
3. Scans run 3 at a time — progress appears inline and in the sidebar
4. Navigate away freely; the scan continues. Come back to Explorer and expand **Scan history** to see what ran

---

## SQL interface

The query engine runs against the live MySQL database. All 97 GSA fields are available. Array fields (e.g. `third_party_service_domains`) are stored as JSON and queryable with `JSON_CONTAINS` or `JSON_SEARCH`:

```sql
-- Sites using a specific CDN
SELECT domain, agency, cdn_provider
FROM sites
WHERE cdn_provider = 'Cloudflare'
ORDER BY agency;

-- USWDS adoption rate by bureau
SELECT bureau,
       COUNT(*) AS total,
       ROUND(100.0 * SUM(CASE WHEN uswds_count > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS uswds_pct
FROM sites
GROUP BY bureau
ORDER BY uswds_pct DESC;

-- Sites missing both sitemap and robots.txt
SELECT domain, agency
FROM sites
WHERE sitemap_xml_detected = 0
  AND robots_txt_detected = 0
  AND live = 1;
```

Only `SELECT` statements are permitted — `DROP`, `DELETE`, `INSERT`, `UPDATE`, and multi-statement queries are blocked server-side.

---

## Deep Research (briefings)

1. Open a site's detail panel → **Research** tab
2. Select a provider (Glean or Claude) and optionally provide a focus area
3. Click **Generate Briefing** — this takes 30–90 seconds
4. The briefing is stored locally and can be exported as Markdown or printed as PDF

Requires `GLEAN_API_KEY` + `GLEAN_ENDPOINT` for Glean, or `ANTHROPIC_API_KEY` for Claude, set in `.env`.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Jump to Explorer and focus search |
| `⌘/` / `Ctrl+/` | Jump to SQL editor |
| `Escape` | Close site detail panel |
| `⌘↵` / `Ctrl+↵` | Run SQL query (inside the editor) |

---

## Development notes

| Component | Details |
|---|---|
| Server | Express on `localhost:3001`, TypeScript via `tsx watch` |
| Client | Vite on `localhost:5173`, proxies `/api` → server |
| Database | MySQL 8.0 via `mysql2`, tables auto-created on server start |
| Schema | `server/src/db/schema.ts` (Drizzle types) · `server/src/db/index.ts` (table DDL + helpers) |
| Scanner modules | `client/src/scanner/` |
| Scan sessions | `server/src/routes/scan-sessions.ts` · `client/src/contexts/ScanQueueContext.tsx` |

### Useful scripts

```bash
# Start everything (server + client)
npm run dev

# Build for production
npm run build

# Type-check client only
npx tsc --noEmit -p client/tsconfig.json

# Open Drizzle Studio (DB browser) — server must be running
npm run db:studio
```

### Resetting the database

If you want a clean slate:

```bash
# Drop and recreate the database
docker compose exec db mysql -uroot -pscanner -e "DROP DATABASE scanner; CREATE DATABASE scanner;"
# Then restart the server — it'll recreate all tables automatically
```

---

## Project structure

```
site-scanner-analyzer/
├── client/                  React + TypeScript + Vite frontend
│   └── src/
│       ├── contexts/        ScanQueueContext (global scan state)
│       ├── scanner/         Site scanner modules (tech detection, DNS, etc.)
│       ├── views/           Top-level page views
│       └── components/      Shared UI components
├── server/                  Express + MySQL backend
│   └── src/
│       ├── db/              Connection pool, helpers, schema, table DDL
│       └── routes/          API route handlers
├── shared/                  Shared TypeScript types
├── docker-compose.yml       MySQL 8.0 for local development
└── .env.example             Environment variable template
```
