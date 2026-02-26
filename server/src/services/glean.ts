import { config } from '../config';

export interface BriefingResult {
  full_markdown: string;
  references: Array<{ title: string; url: string; description: string }>;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
}

export function buildPrompt(site: Record<string, unknown>, scope?: string): string {
  const dapParams = site.dap_parameters
    ? (typeof site.dap_parameters === 'string' ? JSON.parse(site.dap_parameters) : site.dap_parameters)
    : null;

  return `You are a government digital services analyst preparing a professional briefing document.

## Site Data (from GSA Site Scanner)

- **Domain**: ${site.domain}
- **Agency**: ${site.agency}
- **Bureau**: ${site.bureau}
- **URL**: ${site.url}
- **Live**: ${site.live ? 'Yes' : 'No'} (HTTP ${site.status_code})
- **CMS**: ${site.cms || 'Unknown'}
- **HTTPS Enforced**: ${site.https_enforced ? 'Yes' : 'No'} | HSTS: ${site.hsts ? 'Yes' : 'No'}
- **USWDS Score**: ${site.uswds_count ?? 0} components detected
- **DAP**: ${site.dap ? 'Yes' : 'No'}${dapParams ? ` (agency param: ${dapParams.agency || 'N/A'})` : ''}
- **Sitemap**: ${site.sitemap_xml_detected ? `Yes (${site.sitemap_xml_count ?? 0} URLs)` : 'Not detected'}
- **Page Title**: ${site.title || 'None'}
- **Meta Description**: ${site.description || 'None'}
- **Login Provider**: ${site.login_provider || 'None'}
- **Third-Party Services**: ${site.third_party_service_count ?? 0} domains
- **IPv6**: ${site.ipv6 ? 'Yes' : 'No'}
- **Pageviews (DAP)**: ${site.pageviews ?? 'N/A'}
- **Scan Date**: ${site.scan_date || 'Unknown'}

${scope ? `## Research Focus\n${scope}\n` : ''}

## Task

Produce a structured briefing document using EXACTLY these section headers. Be factual, cite sources, and mark anything unverified with "(unverified)".

### 1. Agency/Bureau Identity
Cover: full official name, abbreviation, current leadership (secretary/administrator/director), mission statement (use official language), brief history, and organizational placement within the federal government.

### 2. Website Purpose and Service Delivery
Cover: primary audience(s), core services or content offered, whether this is transactional/informational/hybrid, and its relationship to other agency web properties.

### 3. Current FFY Policy Objectives
Cover: top 2-3 agency priorities for this fiscal year, any known web modernization or consolidation initiatives, and any executive orders or OMB guidance directly affecting this site.

### 4. Recent Milestones (Last 12 Months)
Cover: major policy changes, legislation, or appropriations; website launches or redesigns; notable news events involving this agency.

### 5. Role of This Website in Agency Objectives
Cover: how this specific domain contributes to the agency mission, any gaps between current site state and best practices (based on the scanner data above), and opportunities for improvement.

### 6. References
List 3-5 sources. Each must be a real URL you have high confidence in. Format:
- [Title](URL) — one-sentence description

## Output Requirements
- Use markdown with the exact section headers above (### 1. ..., ### 2. ..., etc.)
- 200-300 words per section
- Flag uncertain claims with "(unverified)"
- References must be real, working URLs`;
}

export function extractReferences(markdown: string): Array<{ title: string; url: string; description: string }> {
  const refs: Array<{ title: string; url: string; description: string }> = [];
  // Match: - [Title](URL) — description
  const refRegex = /[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[—–-]\s*(.+)/g;
  let match;
  while ((match = refRegex.exec(markdown)) !== null) {
    refs.push({
      title: match[1].trim(),
      url: match[2].trim(),
      description: match[3].trim(),
    });
  }
  return refs;
}

export async function generateGleanBriefing(
  site: Record<string, unknown>,
  scope?: string
): Promise<BriefingResult> {
  const { default: fetch } = await import('node-fetch');
  const prompt = buildPrompt(site, scope);

  const endpoint = config.gleanEndpoint.replace(/\/$/, '');
  const chatUrl = `${endpoint}/chat`;

  const body = {
    messages: [{ role: 'user', content: prompt }],
    // Common Glean Chat API parameters
    stream: false,
    temperature: 0.3,
  };

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.gleanApiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000), // 2 min for deep research
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Glean API error ${response.status}: ${text}`);
  }

  const data = await response.json() as any;

  // Glean Chat API response format
  const content: string =
    data.messages?.[data.messages.length - 1]?.content ||
    data.response?.content ||
    data.content ||
    data.text ||
    '';

  if (!content) {
    throw new Error('Glean returned an empty response. Check your API endpoint and key.');
  }

  return {
    full_markdown: content,
    references: extractReferences(content),
    model: data.model || 'glean',
    prompt_tokens: data.usage?.prompt_tokens || null,
    completion_tokens: data.usage?.completion_tokens || null,
  };
}
