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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

Answer questions about the data by calling the provided tools. Prefer the structured tools (resolve_agency, get_stats, get_agency_report, get_site) for common questions, and use run_sql for anything that needs custom aggregation or filtering.

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
];

function apiBase(): string {
  return `http://127.0.0.1:${config.port}/api/v1`;
}

/** Fetch a REST endpoint over loopback and return the raw body as a string. */
async function callRest(path: string, init?: RequestInit): Promise<string> {
  try {
    const res = await fetch(`${apiBase()}${path}`, init);
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
    default:
      return `Unknown tool: ${name}`;
  }
}

export interface ChatResult {
  reply: string;
  tools_used: string[];
}

export async function chat(messages: ChatMessage[]): Promise<ChatResult> {
  if (!config.anthropicApiKey) {
    throw Object.assign(new Error('Anthropic API key is not configured. Add it in Settings.'), { status: 400 });
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const conversation: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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
