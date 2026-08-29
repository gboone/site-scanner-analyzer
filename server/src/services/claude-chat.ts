/**
 * Claude chat over the Site Scanner data.
 *
 * Claude answers questions by calling this server's own public REST endpoints
 * via tool use. The Anthropic API call is made here (key held server-side) and
 * each tool is executed by fetching our REST API over loopback, so all query
 * logic stays in the route layer — there's no second copy of it here.
 *
 * Thinking config is intentionally omitted: it keeps the same code path valid
 * across every model the Settings dropdown can offer (adaptive thinking is
 * recommended but effort/disabled support varies by model, and omitting it is
 * valid everywhere) and keeps the chat snappy.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { sanitizeSingleLine } from '../utils/sanitize';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A snapshot of the user's current Explore view, handed to the chat as starting
 * context. All fields are user-influenced, so everything that lands in the prompt
 * is sanitized in buildContextSection() before embedding (see sanitize.ts).
 */
export interface ChatContext {
  description?: string;                         // human-readable filter summary
  filters?: Record<string, unknown>;            // the query params behind the view
  total?: number;                               // total rows matching the filter
  sample?: Array<Record<string, unknown>>;      // a sample of matching rows
}

const CONTEXT_SAMPLE_CAP = 100;

const MAX_TOOL_ITERATIONS = 8;
const MAX_TOOL_RESULT_CHARS = 60_000; // guard against runaway context growth

// REVISIT (after real usage): the prompt deliberately stays light. We are NOT
// (yet) hard-steering Claude on population semantics — e.g. that get_stats /
// run_sql count ALL rows for an agency (live + dead, public + internal), while
// get_agency_report applies PUBLIC_ONLY_CONDITION. Users can ask follow-ups to
// clarify which population a number describes, so we are letting tested usage
// tell us whether more specific instructions are worth adding. If we see people
// repeatedly misreading "public site" stats, add explicit guidance here (or a
// public_only flag on get_stats) — see PLAN.md "Follow-ups".
const SYSTEM_PROMPT = `You are a data analyst embedded in the GSA Site Scan Analyzer. You help users explore a database of U.S. federal government websites built from GSA Site Scanner data.

Answer questions about the data by calling the provided tools. Prefer the structured tools (resolve_agency, get_stats, get_agency_report, get_site) for common questions, use list_sites to list or page through sites with the same filters the Explore UI uses, and use run_sql for anything that needs custom aggregation or filtering.

The main table is \`sites\` (one row per domain). Useful columns include:
- domain, agency, bureau, title, description, cms, language
- live (1/0), redirect (1/0), status_code, scan_date, updated_at
- uswds_count (>0 means the U.S. Web Design System was detected), uswds_semantic_version
- dap (1/0 — Digital Analytics Program), pageviews
- https_enforced (1/0), hsts (1/0), security_header_csp
- sitemap_xml_detected (1/0), robots_txt_detected (1/0)
- hosting_provider, cdn_provider, web_server, detected_technologies
- third_party_service_count, third_party_service_domains (JSON)

run_sql accepts SELECT statements only. Always add a LIMIT for exploratory queries.

When a user names an agency by acronym or nickname (e.g. "VA", "the FBI", "NOAA"), call resolve_agency first to get the exact stored name, then use it. Be concise, lead with the answer, and cite concrete numbers from the tools rather than guessing.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'resolve_agency',
    description:
      'Resolve an agency acronym, nickname, or partial name to the exact agency name(s) stored in the database, with site counts. Returns a single match or disambiguation candidates.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Acronym, nickname, or partial agency name (e.g. "VA", "NOAA", "Justice")' },
      },
      required: ['q'],
    },
  },
  {
    name: 'get_stats',
    description:
      'Get aggregate adoption statistics (USWDS, DAP, HTTPS, CDN, CMS breakdown, etc.) for all sites, or scoped to an agency and/or bureau.',
    input_schema: {
      type: 'object',
      properties: {
        agency: { type: 'string', description: 'Exact agency name (use resolve_agency first if unsure)' },
        bureau: { type: 'string', description: 'Exact bureau name within the agency' },
      },
    },
  },
  {
    name: 'get_agency_report',
    description:
      'Get public website data and a summary for an agency or bureau by name. Resolves the name internally and returns matched sites plus summary counts.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Agency or bureau name (exact or partial)' },
        fields: { type: 'string', description: 'Optional: "agent_default" (default), "all", "simplified", or a comma-separated field list' },
        limit: { type: 'integer', description: 'Max sites to return (default 25, max 500)' },
      },
      required: ['q'],
    },
  },
  {
    name: 'get_site',
    description: 'Get the full scan record for a single site by its domain.',
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'The exact domain, e.g. "www.va.gov"' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'run_sql',
    description:
      'Run a read-only SELECT query against the database for custom aggregation or filtering. SELECT statements only; always include a LIMIT for exploratory queries.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A single SELECT statement' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_sites',
    description:
      'List sites with the same filters the Explore UI uses, returning a paginated page of full site records. Use this to reproduce, page through, or refine the set behind the user\'s current view. For aggregate counts across the whole set, prefer run_sql.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number, 1-indexed (default 1)' },
        limit: { type: 'integer', description: 'Rows per page, max 5000 (default 25)' },
        sort: { type: 'string', description: 'Column to sort by (e.g. pageviews, uswds_count, domain)' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default asc)' },
        search: { type: 'string', description: 'Fuzzy match across domain, agency, bureau, title, city, state' },
        agency: { type: 'string', description: 'Exact agency name' },
        bureau: { type: 'string', description: 'Exact bureau name' },
        branch: { type: 'string', description: 'Government branch / jurisdiction type' },
        state: { type: 'string', description: 'Two-letter state code' },
        live: { type: 'boolean', description: 'true = live sites only, false = non-live only' },
        has_uswds: { type: 'boolean', description: 'true = uses U.S. Web Design System, false = does not' },
        has_dap: { type: 'boolean', description: 'true = Digital Analytics Program present' },
        https_enforced: { type: 'boolean', description: 'true = HTTPS enforced' },
        public_only: { type: 'boolean', description: 'true = exclude staging/internal/non-public sites' },
        cms: { type: 'string', description: 'CMS filter value (e.g. "Drupal", "WordPress")' },
        cms_mode: { type: 'string', enum: ['contains', 'exact', 'excludes'], description: 'How to match cms (default contains)' },
        column_filters: {
          type: 'array',
          description: 'Generic per-column filters mirroring the UI\'s advanced filters.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Column name' },
              mode: {
                type: 'string',
                enum: ['contains', 'exact', 'not_exact', 'excludes', 'gt', 'lt', 'is_null', 'is_not_null'],
                description: 'Match mode. is_null/is_not_null take no value.',
              },
              value: { type: 'string', description: 'Value to match (omit for is_null / is_not_null)' },
            },
            required: ['field'],
          },
        },
      },
    },
  },
];

const BOOL_PARAMS = new Set(['live', 'has_uswds', 'has_dap', 'https_enforced', 'public_only']);
const STRING_PARAMS = new Set(['sort', 'order', 'search', 'agency', 'bureau', 'branch', 'state', 'cms', 'cms_mode']);

/** Translate a list_sites tool input into a GET /sites query string. Exported for testing. */
export function buildListSitesQuery(input: any): string {
  const params = new URLSearchParams();
  if (input?.page != null) params.set('page', String(input.page));
  if (input?.limit != null) params.set('limit', String(input.limit));
  for (const key of STRING_PARAMS) {
    if (input?.[key] != null && input[key] !== '') params.set(key, String(input[key]));
  }
  for (const key of BOOL_PARAMS) {
    if (typeof input?.[key] === 'boolean') params.set(key, String(input[key]));
  }
  if (Array.isArray(input?.column_filters)) {
    for (const cf of input.column_filters) {
      if (!cf || !cf.field) continue;
      const mode = String(cf.mode ?? 'contains');
      const isNullMode = mode === 'is_null' || mode === 'is_not_null';
      if (!isNullMode && (cf.value == null || cf.value === '')) continue;
      params.set(`cf_${cf.field}`, isNullMode ? '' : String(cf.value));
      params.set(`cfm_${cf.field}`, mode);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Build the "Current view" system-prompt section from an Explore context.
 *
 * Every user-influenced value is sanitized (control chars stripped) and embedded
 * as JSON so the model treats it as inert data, not instructions — the same
 * defense-in-depth pattern used elsewhere for stored prompt content. Exported for
 * testing.
 */
export function buildContextSection(context: ChatContext): string {
  const lines: string[] = [];
  lines.push(
    '\n\n# Current view',
    'The user started this chat from a filtered view in the Explore UI. Treat the data below as their starting point — answer questions about it directly, but you may also query the full dataset (list_sites, run_sql, get_stats) to put it in broader context.'
  );

  const description = sanitizeSingleLine(context.description, 300);
  if (description) lines.push(`\nFilter summary: ${JSON.stringify(description)}`);

  if (context.filters && typeof context.filters === 'object') {
    const safeFilters = sanitizeObject(context.filters);
    if (Object.keys(safeFilters).length > 0) {
      lines.push(
        `\nThe view's filters map to these list_sites parameters (reuse them to reproduce or page through the set):\n${JSON.stringify(safeFilters)}`
      );
    }
  }

  const total = Number.isFinite(context.total) ? Number(context.total) : undefined;
  const sample = Array.isArray(context.sample) ? context.sample.slice(0, CONTEXT_SAMPLE_CAP) : [];
  if (total != null) lines.push(`\nTotal sites matching this view: ${total}.`);
  if (sample.length > 0) {
    const safeSample = sample.map(sanitizeObject);
    const caveat =
      total != null && total > sample.length
        ? ` This is a sample of ${sample.length} of ${total}; use list_sites with the parameters above to page through the rest before making claims about the whole set.`
        : '';
    lines.push(`\nSample of the matching sites (key fields only):${caveat}\n${JSON.stringify(safeSample)}`);
  }

  return lines.join('\n');
}

/** Sanitize all string values in a flat object; non-strings pass through. */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      const cleaned = sanitizeSingleLine(v, 500);
      if (cleaned != null) out[k] = cleaned;
    } else if (v != null) {
      out[k] = v;
    }
  }
  return out;
}

function apiBase(): string {
  return `http://127.0.0.1:${config.port}/api/v1`;
}

/** Fetch a REST endpoint over loopback and return the raw body as a string. */
export async function callRest(path: string, init?: RequestInit): Promise<string> {
  try {
    // Loopback traffic has no reason to be in ALLOWED_IPS, so it can't rely
    // on apiTokenGate's dual-path IP check — attach the real token instead.
    // See docs/adr/0001-app-level-access-control.md.
    const headers = { ...init?.headers, Authorization: `Bearer ${config.scannerApiToken}` };
    const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
    const body = await res.text();
    const out = res.ok ? body : `Request failed (HTTP ${res.status}): ${body}`;
    return out.length > MAX_TOOL_RESULT_CHARS
      ? out.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…(truncated)'
      : out;
  } catch (err: any) {
    return `Tool error: ${err?.message ?? String(err)}`;
  }
}

async function runTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'resolve_agency':
      return callRest(`/agencies/resolve?q=${encodeURIComponent(String(input?.q ?? ''))}`);
    case 'get_stats': {
      const params = new URLSearchParams();
      if (input?.agency) params.set('agency', String(input.agency));
      if (input?.bureau) params.set('bureau', String(input.bureau));
      const qs = params.toString();
      return callRest(`/stats${qs ? `?${qs}` : ''}`);
    }
    case 'get_agency_report': {
      const params = new URLSearchParams({ q: String(input?.q ?? '') });
      params.set('fields', input?.fields ? String(input.fields) : 'agent_default');
      params.set('limit', String(input?.limit ?? 25));
      return callRest(`/report?${params.toString()}`);
    }
    case 'get_site':
      return callRest(`/sites/${encodeURIComponent(String(input?.domain ?? ''))}`);
    case 'run_sql':
      return callRest('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: String(input?.sql ?? '') }),
      });
    case 'list_sites':
      return callRest(`/sites${buildListSitesQuery(input)}`);
    default:
      return `Unknown tool: ${name}`;
  }
}

export interface ChatResult {
  reply: string;
  tools_used: string[];
}

export async function chat(messages: ChatMessage[], context?: ChatContext): Promise<ChatResult> {
  if (!config.anthropicApiKey) {
    throw Object.assign(new Error('Anthropic API key is not configured. Add it in Settings.'), { status: 400 });
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const system = context ? SYSTEM_PROMPT + buildContextSection(context) : SYSTEM_PROMPT;
  const conversation: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 4096,
      system,
      tools: TOOLS,
      messages: conversation,
    });

    if (response.stop_reason === 'refusal') {
      return { reply: 'I can’t help with that request.', tools_used: toolsUsed };
    }

    if (response.stop_reason === 'tool_use') {
      // Echo the assistant turn back verbatim (preserves tool_use blocks).
      conversation.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name);
          const result = await runTool(block.name, block.input);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      conversation.push({ role: 'user', content: toolResults });
      continue;
    }

    // Terminal turn — collect the text blocks.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { reply: text || '(no response)', tools_used: toolsUsed };
  }

  return {
    reply: 'I stopped after several tool calls without finishing. Try narrowing the question.',
    tools_used: toolsUsed,
  };
}

/** List models the configured API key can access. */
export async function listModels(): Promise<{ id: string; display_name: string }[]> {
  if (!config.anthropicApiKey) {
    throw Object.assign(new Error('Anthropic API key is not configured.'), { status: 400 });
  }
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const models: { id: string; display_name: string }[] = [];
  for await (const m of client.models.list()) {
    models.push({ id: m.id, display_name: (m as any).display_name ?? m.id });
  }
  return models;
}
