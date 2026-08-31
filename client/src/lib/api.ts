import type { ApiMeta } from 'shared';

const BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getSites: (params: Record<string, string | number | boolean>) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();
    return request(`/sites?${q}`);
  },
  getSite: (domain: string) => request(`/sites/${encodeURIComponent(domain)}`),
  updateSite: (domain: string, data: Record<string, unknown>) =>
    request(`/sites/${encodeURIComponent(domain)}`, { method: 'PUT', body: JSON.stringify(data) }),
  getStats: (filter?: { agency?: string; bureau?: string; domains?: string[] }) => {
    const q = new URLSearchParams();
    if (filter?.agency) q.set('agency', filter.agency);
    if (filter?.bureau) q.set('bureau', filter.bureau);
    if (filter?.domains?.length) q.set('domains', filter.domains.join(','));
    const qs = q.toString();
    return request(`/stats${qs ? `?${qs}` : ''}`);
  },
  runQuery: (sql: string) =>
    request('/query', { method: 'POST', body: JSON.stringify({ sql }) }),
  getScans: (domain: string) => request(`/scans/${encodeURIComponent(domain)}`),
  postScan: (domain: string, scan_result: unknown, diff_summary?: unknown) =>
    request('/scans', { method: 'POST', body: JSON.stringify({ domain, scan_result, diff_summary }) }),
  getBriefings: (domain: string) =>
    request<{ data: Record<string, unknown>[]; meta: ApiMeta }>(`/briefings/${encodeURIComponent(domain)}`),
  createBriefing: (domain: string, provider: string, scope?: string) =>
    request('/briefings', { method: 'POST', body: JSON.stringify({ domain, provider, scope }) }),
  exportBriefing: (id: number) => `${BASE}/briefings/export/${id}`,
  fetchGSA: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return request(`/gsa/fetch?${q}`);
  },
  importFromGSA: async (
    agency?: string,
    onProgress?: (data: { page: number; totalPages: number; inserted: number; updated: number }) => void
  ) => {
    const res = await fetch(`${BASE}/gsa/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency: agency || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as any).error || `HTTP ${res.status}`);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: any = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'complete' || data.type === 'error') result = data;
          else if (data.type === 'progress') onProgress?.(data);
        } catch { /* ignore partial lines */ }
      }
    }
    if (result?.type === 'error') throw new Error(result.error);
    return result;
  },
  getAgencySuggestions: (q: string) =>
    request<{ data: { value: string; count: number }[]; meta: ApiMeta }>(`/agencies?q=${encodeURIComponent(q)}`),
  getBureauSuggestions: (q: string, agency?: string) => {
    const params = new URLSearchParams({ q });
    if (agency) params.set('agency', agency);
    return request<{ data: { value: string; count: number }[]; meta: ApiMeta }>(`/bureaus?${params}`);
  },
  testGSA: () => request('/gsa/test'),
  getSettings: () => request<Record<string, string>>('/settings'),
  setSetting: (key: string, value: string) =>
    request(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),

  // Claude chat over the site data
  listModels: () => request<{ data: { id: string; display_name: string }[]; meta: ApiMeta }>('/models'),
  chat: (
    messages: { role: 'user' | 'assistant'; content: string }[],
    context?: object
  ) =>
    request<{ reply: string; tools_used: string[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify(context ? { messages, context } : { messages }),
    }),
  resolveAgency: (q: string) =>
    request<{
      query: string;
      match: { agency: string; source: string; site_count: number } | null;
      candidates: { agency: string; source: string; site_count: number }[] | null;
    }>(`/agencies/resolve?q=${encodeURIComponent(q)}`),
  health: () => request('/health'),

  // Scan sessions — persists bulk-scan progress across page loads
  getScanSessions: () => request<{ data: Record<string, unknown>[]; meta: ApiMeta }>('/scan-sessions'),
  createScanSession: (total_domains: number, label?: string) =>
    request<{ id: number }>('/scan-sessions', {
      method: 'POST',
      body: JSON.stringify({ total_domains, label }),
    }),
  updateScanSession: (id: number, data: {
    status?: string;
    completed_count?: number;
    failed_count?: number;
  }) =>
    request(`/scan-sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // get.gov registry import
  importFromGetGov: async (
    onProgress?: (data: { processed: number; total: number; inserted: number; updated: number }) => void
  ) => {
    const res = await fetch(`${BASE}/getgov/import`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as any).error || `HTTP ${res.status}`);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: any = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'complete' || data.type === 'error') result = data;
          else if (data.type === 'progress') onProgress?.(data);
        } catch { /* ignore partial lines */ }
      }
    }
    if (result?.type === 'error') throw new Error(result.error);
    return result;
  },
  testGetGov: () => request('/getgov/test'),
  getDomainTypes: () => request<{ data: string[]; meta: ApiMeta }>('/sites/domain-types'),

  // Scheduler — configured scheduled background jobs
  getSchedulerStatus: () => request<{
    gsa: { enabled: boolean; interval: string; agency?: string; last_run?: string; last_status?: string };
    scan: { enabled: boolean; interval: string; filter: string; last_run?: string; last_status?: string; last_session_id?: string; scan_is_running: boolean };
    getgov: { enabled: boolean; interval: string; last_run?: string; last_status?: string };
  }>('/scheduler/status'),
  updateGsaSchedule: (data: { enabled?: boolean; interval?: string; agency?: string }) =>
    request('/scheduler/gsa', { method: 'PUT', body: JSON.stringify(data) }),
  updateScanSchedule: (data: { enabled?: boolean; interval?: string; filter?: string }) =>
    request('/scheduler/scan', { method: 'PUT', body: JSON.stringify(data) }),
  updateGetGovSchedule: (data: { enabled?: boolean; interval?: string }) =>
    request('/scheduler/getgov', { method: 'PUT', body: JSON.stringify(data) }),
  triggerGsaRefresh: () =>
    request('/scheduler/gsa/run', { method: 'POST' }),
  triggerSiteRescan: () =>
    request('/scheduler/scan/run', { method: 'POST' }),
  stopSiteRescan: () =>
    request('/scheduler/scan/stop', { method: 'POST' }),
  triggerGetGovRefresh: () =>
    request('/scheduler/getgov/run', { method: 'POST' }),
};
