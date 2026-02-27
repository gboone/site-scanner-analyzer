import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useStats } from '../hooks/useSites';
import { api } from '../lib/api';
import AgencyBureauFilter from '../components/AgencyBureauFilter';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

const GOV_BLUE = '#005EA2';
const GOV_BLUE_LIGHT = '#73B3E7';
const PIE_COLORS = ['#2e7d32', '#c62828', '#f57c00'];

function truncateBureau(name: string, maxLen = 28) {
  const short = name.split(' - ').pop() || name;
  return short.length > maxLen ? short.slice(0, maxLen - 1) + '…' : short;
}

type AiProvider = 'claude' | 'glean';

export default function DashboardView() {
  const [agency, setAgency] = React.useState('');
  const [bureau, setBureau] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<{ agency?: string; bureau?: string }>({});

  const { data: stats, isLoading } = useStats(activeFilter);

  // AI summary state
  const [aiProvider, setAiProvider] = React.useState<AiProvider>('claude');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

  const applyFilter = () => {
    setActiveFilter({
      agency: agency.trim() || undefined,
      bureau: bureau.trim() || undefined,
    });
    setAiSummary(null);
  };

  const clearFilter = () => {
    setAgency('');
    setBureau('');
    setActiveFilter({});
    setAiSummary(null);
  };

  const generateSummary = async () => {
    if (!stats) return;
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const res = await api.summarizeDashboard(aiProvider, activeFilter) as any;
      setAiSummary(res?.summary || JSON.stringify(res, null, 2));
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>;
  if (!stats) return <div className="p-8 text-gray-400">No data yet. Import data first or use Settings → Import from GSA.</div>;

  const s = stats as any;

  const bureauUswdsData = (s.by_bureau as any[])
    .slice(0, 12)
    .map((b: any) => ({
      name: truncateBureau(b.bureau),
      uswds: Number((b.uswds_avg ?? 0).toFixed(1)),
    }));

  const sitemapData = [
    { name: 'Detected', value: s.sitemap_health.detected },
    { name: 'Not detected', value: s.sitemap_health.not_detected },
    ...(s.sitemap_health.error > 0 ? [{ name: 'Error', value: s.sitemap_health.error }] : []),
  ];

  const thirdPartyData = (s.top_third_party_domains as any[])
    .slice(0, 12)
    .map((d: any) => ({
      name: d.domain,
      sites: d.site_count,
    }));

  const bureauSiteData = ((s.by_bureau_sites || s.by_bureau) as any[])
    .slice(0, 10)
    .map((b: any) => ({
      name: truncateBureau(b.bureau, 22),
      sites: b.count,
    }));

  const hasFilter = !!(activeFilter.agency || activeFilter.bureau);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-screen-xl mx-auto">

        {/* Header + filter bar */}
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <h1 className="text-xl font-bold text-gray-900 mr-2">Dashboard</h1>

          <AgencyBureauFilter
            agency={agency}
            bureau={bureau}
            onAgencyChange={setAgency}
            onBureauChange={setBureau}
            onApply={applyFilter}
            onClear={clearFilter}
            hasFilter={hasFilter}
          />

          {/* Agency filter pills from data */}
          {!hasFilter && (s.by_agency as any[]).length > 0 && (
            <div className="flex gap-1.5 flex-wrap ml-1">
              {(s.by_agency as any[]).slice(0, 6).map((a: any) => (
                <button
                  key={a.agency}
                  onClick={() => { setAgency(a.agency); setActiveFilter({ agency: a.agency }); setAiSummary(null); }}
                  className="text-xs bg-gray-100 hover:bg-gov-blue hover:text-white rounded-full px-2.5 py-1 transition-colors"
                >
                  {a.agency}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active filter banner */}
        {hasFilter && (
          <div className="mb-5 text-sm text-gov-blue bg-blue-50 border border-blue-200 rounded px-3 py-2">
            Showing data for{' '}
            {activeFilter.agency && <><strong>{activeFilter.agency}</strong>{' '}</>}
            {activeFilter.bureau && <>bureau / office: <strong>{activeFilter.bureau}</strong>{' '}</>}
            — {s.total_sites.toLocaleString()} sites
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Total Sites" value={s.total_sites.toLocaleString()} />
          <StatCard label="Live" value={`${s.live_pct}%`} sub={`${s.live_count} sites`} />
          <StatCard label="Has USWDS" value={`${s.uswds_any_pct}%`} sub={`${s.uswds_any_count} sites`} />
          <StatCard label="Has DAP" value={`${s.dap_pct}%`} sub={`${s.dap_count} sites`} />
          <StatCard label="HTTPS Enforced" value={`${s.https_enforced_pct}%`} sub={`${s.https_enforced_count} sites`} />
        </div>

        {/* AI Summary panel */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-sm font-semibold text-gray-700">AI Summary</h2>
            <select
              value={aiProvider}
              onChange={e => setAiProvider(e.target.value as AiProvider)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gov-blue"
            >
              <option value="claude">Claude</option>
              <option value="glean">Glean</option>
            </select>
            <button
              onClick={generateSummary}
              disabled={aiLoading}
              className="btn-primary text-xs disabled:opacity-50"
            >
              {aiLoading ? 'Generating…' : 'Generate Summary'}
            </button>
            {aiSummary && (
              <button
                onClick={() => setAiSummary(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Dismiss
              </button>
            )}
          </div>
          {aiError && <div className="text-xs text-red-600">{aiError}</div>}
          {aiSummary && (
            <div className="mt-2 text-sm text-gray-700 prose prose-sm max-w-none border-t border-gray-100 pt-3 whitespace-pre-wrap">
              {aiSummary}
            </div>
          )}
          {!aiSummary && !aiError && !aiLoading && (
            <div className="text-xs text-gray-400">
              Generate an AI narrative summary of the current dashboard view
              {hasFilter ? ` for ${activeFilter.agency || activeFilter.bureau}` : ''}.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* USWDS avg by bureau — horizontal bar */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Avg USWDS Score by Bureau (top 12)</h2>
            <ResponsiveContainer width="100%" height={290}>
              <BarChart
                layout="vertical"
                data={bureauUswdsData}
                margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(val: any) => [`${val}`, 'Avg USWDS score']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="uswds" fill={GOV_BLUE} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sitemap health — pie */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Sitemap Health</h2>
            <ResponsiveContainer width="100%" height={290}>
              <PieChart>
                <Pie
                  data={sitemapData}
                  cx="50%"
                  cy="42%"
                  outerRadius={95}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: '#9ca3af' }}
                >
                  {sitemapData.map((_entry, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Tooltip formatter={(val: any) => [`${val} sites`]} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top third-party domains — horizontal bar */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Third-Party Domains</h2>
            <ResponsiveContainer width="100%" height={310}>
              <BarChart
                layout="vertical"
                data={thirdPartyData}
                margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={155}
                  tick={{ fontSize: 10, fontFamily: 'monospace' }}
                />
                <Tooltip
                  formatter={(val: any) => [`${val} sites`, 'Appears on']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="sites" fill={GOV_BLUE_LIGHT} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sites by bureau — vertical bar */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Sites by Bureau (top 10)</h2>
            <ResponsiveContainer width="100%" height={310}>
              <BarChart
                data={bureauSiteData}
                margin={{ top: 0, right: 16, left: 4, bottom: 70 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9 }}
                  angle={-38}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(val: any) => [`${val}`, 'Sites']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="sites" fill={GOV_BLUE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>
    </div>
  );
}
