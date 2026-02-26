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
  getStats: (filter?: { agency?: string; bureau?: string }) => {
    const q = new URLSearchParams();
    if (filter?.agency) q.set('agency', filter.agency);
    if (filter?.bureau) q.set('bureau', filter.bureau);
    const qs = q.toString();
    return request(`/stats${qs ? `?${qs}` : ''}`);
  },
  importSites: (sites: unknown[]) =>
    request('/import', { method: 'POST', body: JSON.stringify(sites) }),
  runQuery: (sql: string) =>
    request('/query', { method: 'POST', body: JSON.stringify({ sql }) }),
  getScans: (domain: string) => request(`/scans/${encodeURIComponent(domain)}`),
  postScan: (domain: string, scan_result: unknown, diff_summary?: unknown) =>
    request('/scans', { method: 'POST', body: JSON.stringify({ domain, scan_result, diff_summary }) }),
  getBriefings: (domain: string) => request(`/briefings/${encodeURIComponent(domain)}`),
  createBriefing: (domain: string, provider: string, scope?: string) =>
    request('/briefings', { method: 'POST', body: JSON.stringify({ domain, provider, scope }) }),
  exportBriefing: (id: number) => `${BASE}/briefings/export/${id}`,
  fetchGSA: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return request(`/gsa/fetch?${q}`);
  },
  importFromGSA: (agency?: string) =>
    request('/gsa/import', { method: 'POST', body: JSON.stringify({ agency: agency || undefined }) }),
  summarizeDashboard: (provider: 'claude' | 'glean', filter?: { agency?: string; bureau?: string }) =>
    request('/stats/summarize', {
      method: 'POST',
      body: JSON.stringify({ provider, agency: filter?.agency || '', bureau: filter?.bureau || '' }),
    }),
  getAgencySuggestions: (q: string) =>
    request<{ value: string; count: number }[]>(`/agencies?q=${encodeURIComponent(q)}`),
  getBureauSuggestions: (q: string, agency?: string) => {
    const params = new URLSearchParams({ q });
    if (agency) params.set('agency', agency);
    return request<{ value: string; count: number }[]>(`/bureaus?${params}`);
  },
  testGlean: () => request('/settings/test-glean'),
  testGSA: () => request('/gsa/test'),
  getSettings: () => request<Record<string, string>>('/settings'),
  setSetting: (key: string, value: string) =>
    request(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  health: () => request('/health'),
};
