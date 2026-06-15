import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useStats } from '../hooks/useSites';
import { useUIStore } from '../store/uiStore';
import { api } from '../lib/api';
import type { StatsResponse } from 'shared';
import type { View } from '../App';
import ReportScopePicker from '../components/reports/ReportScopePicker';
import ReportHeader from '../components/reports/ReportHeader';
import ScanCoverageAlert from '../components/reports/ScanCoverageAlert';
import { exportPPT } from '../lib/export';

interface Props {
  onNavigate: (view: View) => void;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
const GOV_BLUE = '#005EA2';
const GOV_BLUE_LIGHT = '#73B3E7';

function truncate(name: string | null | undefined, maxLen = 28) {
  const safe = name ?? '';
  const short = safe.split(' - ').pop() || safe;
  return short.length > maxLen ? short.slice(0, maxLen - 1) + '…' : short;
}

function StatTile({ label, value, sub, good }: { label: string; value: string | number; sub?: string; good?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${good === true ? 'text-green-600' : good === false ? 'text-red-500' : 'text-gray-800'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function DashboardView({ onNavigate }: Props) {
  const { reportConfig, clearReport } = useUIStore();

  // Build filter for the stats hook based on reportConfig scope
  const statsFilter = React.useMemo(() => {
    if (!reportConfig) return undefined;
    if (reportConfig.scope === 'agency') {
      return {
        agency: reportConfig.agency,
        bureau: reportConfig.bureaus?.[0],
      };
    }
    // 'selection' or 'sql' — use explicit domain list
    return reportConfig.domains?.length
      ? { domains: reportConfig.domains }
      : undefined;
  }, [reportConfig]);

  const { data: stats, isLoading, isError, error } = useStats(statsFilter) as {
    data: StatsResponse | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };

  const handleExportJSON = () => {
    if (!stats) return;
    const payload = { reportConfig, stats };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearReport = () => {
    clearReport();
  };

  // ── No report config → scope picker ────────────────────────────────────
  if (!reportConfig) {
    return <ReportScopePicker onNavigate={onNavigate} />;
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400" role="status" aria-live="polite">
        Loading report…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-red-500">
        <p className="font-semibold">Failed to load report data.</p>
        {error && <p className="text-sm text-gray-500 max-w-md text-center">{error.message}</p>}
        <button onClick={handleClearReport} className="btn-secondary text-sm">← New report</button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <p>No data returned for this scope.</p>
        <button onClick={handleClearReport} className="btn-secondary text-sm">← New report</button>
      </div>
    );
  }

  const s = stats;
  const total = s.total_sites;
  const showDapUswds = !s.by_branch?.length || s.by_branch.some((b) => b.branch?.includes('Executive'));

  // ── Chart data ───────────────────────────────────────────────────────────
  const bureauUswdsData = (s.by_bureau ?? [])
    .slice(0, 12)
    .map((b) => ({ name: truncate(b.bureau), uswds: Number(Number(b.uswds_avg ?? 0).toFixed(1)) }));

  const sitemapData = [
    { name: 'Detected',     value: s.sitemap_health.detected     },
    { name: 'Not detected', value: s.sitemap_health.not_detected  },
    ...(s.sitemap_health.error > 0 ? [{ name: 'Error', value: s.sitemap_health.error }] : []),
  ];

  const thirdPartyData = (s.top_third_party_domains ?? [])
    .slice(0, 12)
    .map((d) => ({ name: d.domain, sites: d.site_count }));

  const bureauSiteData = ((s.by_bureau_sites || s.by_bureau) ?? [])
    .slice(0, 10)
    .map((b) => ({ name: truncate(b.bureau, 22), sites: b.count }));

  const cmsData = (s.by_cms ?? [])
    .slice(0, 8)
    .map((r) => ({ name: r.cms || 'Unknown', value: r.count }));

  const httpsDonut = [
    { name: 'Enforced',     value: s.https_enforced_count },
    { name: 'Not enforced', value: total - s.https_enforced_count },
  ];

  const uswdsDonut = [
    { name: 'USWDS',    value: s.uswds_any_count },
    { name: 'No USWDS', value: total - s.uswds_any_count },
  ];

  const lcpData = s.performance_summary?.lcp
    ? [
        { name: 'Good (<2.5s)',    value: s.performance_summary.lcp.good },
        { name: 'Needs work',      value: s.performance_summary.lcp.needs_improvement },
        { name: 'Poor (>4s)',      value: s.performance_summary.lcp.poor },
        { name: 'No data',         value: s.performance_summary.lcp.no_data },
      ].filter((d) => d.value > 0)
    : [];

  const clsData = s.performance_summary?.cls
    ? [
        { name: 'Good (<0.1)',    value: s.performance_summary.cls.good },
        { name: 'Needs work',     value: s.performance_summary.cls.needs_improvement },
        { name: 'Poor (>0.25)',   value: s.performance_summary.cls.poor },
        { name: 'No data',        value: s.performance_summary.cls.no_data },
      ].filter((d) => d.value > 0)
    : [];

  const branchData = (s.by_branch ?? []).map((b) => ({ name: b.branch || 'Unknown', value: b.count }));

  const PIE_COLORS_SITEMAP = ['#2e7d32', '#c62828', '#f57c00'];
  const PERF_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#9ca3af'];

  return (
    <div className="flex flex-col h-full overflow-auto print:overflow-visible">
      <ReportHeader
        stats={stats}
        onClear={handleClearReport}
        onExportJSON={handleExportJSON}
        onExportPPT={() => exportPPT(reportConfig!, stats)}
      />

      <div className="flex-1 px-8 py-6 max-w-screen-xl mx-auto w-full space-y-8">

        {/* Scan coverage alert */}
        {s.scan_coverage && <ScanCoverageAlert stats={s} />}

        {/* ── Summary stat tiles ──────────────────────────────────────── */}
        <section aria-label="Summary stats">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Summary</h2>
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${showDapUswds ? 'lg:grid-cols-6' : 'lg:grid-cols-4'} gap-3`}>
            <StatTile label="Total" value={total.toLocaleString()} />
            <StatTile
              label="Live"
              value={`${s.live_pct}%`}
              sub={`${s.live_count.toLocaleString()} sites`}
              good={s.live_pct >= 90}
            />
            <StatTile
              label="HTTPS"
              value={`${s.https_enforced_pct}%`}
              sub={`${s.https_enforced_count.toLocaleString()} sites`}
              good={s.https_enforced_pct >= 90}
            />
            {showDapUswds && (
              <StatTile
                label="USWDS"
                value={`${s.uswds_any_pct}%`}
                sub={`${s.uswds_any_count.toLocaleString()} sites`}
              />
            )}
            {showDapUswds && (
              <StatTile
                label="DAP"
                value={`${s.dap_pct}%`}
                sub={`${s.dap_count.toLocaleString()} sites`}
              />
            )}
            <StatTile
              label="Sitemap"
              value={`${s.sitemap_detected_pct}%`}
              sub={`${s.sitemap_detected_count.toLocaleString()} sites`}
            />
          </div>
        </section>

        {/* EOL + scan coverage secondary row */}
        {(s.eol_risk_count > 0 || s.scan_coverage) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {s.eol_risk_count > 0 && (
              <StatTile
                label="EOL Risk"
                value={s.eol_risk_count}
                sub="Sites on end-of-life CMS"
                good={false}
              />
            )}
            {s.scan_coverage && (
              <>
                <StatTile
                  label="Never scanned"
                  value={s.scan_coverage.never_scanned_count.toLocaleString()}
                  sub="of total sites"
                  good={s.scan_coverage.never_scanned_count === 0 ? true : undefined}
                />
                <StatTile
                  label="Stale (>90d)"
                  value={s.scan_coverage.stale_count.toLocaleString()}
                  sub="sites"
                  good={s.scan_coverage.stale_count === 0 ? true : undefined}
                />
                <StatTile
                  label="Scanned"
                  value={s.scan_coverage.scanned_count.toLocaleString()}
                  sub="sites with fresh data"
                  good={s.scan_coverage.scanned_count > 0 ? true : undefined}
                />
              </>
            )}
          </div>
        )}

        {/* ── HTTPS + USWDS donuts ────────────────────────────────────── */}
        <section aria-label="Adoption charts">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Adoption</h2>
          <div className={`grid grid-cols-1 ${showDapUswds ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
            <ChartCard title="HTTPS Enforcement">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={httpsDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={45}>
                    <Cell fill="#10b981" />
                    <Cell fill="#e5e7eb" />
                  </Pie>
                  <Tooltip formatter={(v) => [v, '']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {showDapUswds && (
              <ChartCard title="USWDS Adoption">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={uswdsDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={45}>
                      <Cell fill={GOV_BLUE} />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                    <Tooltip formatter={(v) => [v, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* CMS mix */}
            <ChartCard title="CMS Mix">
              {cmsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={cmsData} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Sites" radius={[0, 3, 3, 0]}>
                      {cmsData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-gray-400 py-8 text-center">No CMS data</p>
              )}
            </ChartCard>
          </div>
        </section>

        {/* ── Performance ─────────────────────────────────────────────── */}
        {(lcpData.length > 0 || clsData.length > 0) && (
          <section aria-label="Performance">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lcpData.length > 0 && (
                <ChartCard title="Largest Contentful Paint (LCP)">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={lcpData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                        {lcpData.map((_, i) => <Cell key={i} fill={PERF_COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {clsData.length > 0 && (
                <ChartCard title="Cumulative Layout Shift (CLS)">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={clsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                        {clsData.map((_, i) => <Cell key={i} fill={PERF_COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          </section>
        )}

        {/* ── Sitemap + Third-party + Bureau breakdown ─────────────────── */}
        <section aria-label="Infrastructure">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Infrastructure</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Sitemap health */}
            <ChartCard title="Sitemap Health">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={sitemapData}
                    cx="50%"
                    cy="42%"
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: '#9ca3af' }}
                  >
                    {sitemapData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS_SITEMAP[i % PIE_COLORS_SITEMAP.length]} />
                    ))}
                  </Pie>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Tooltip formatter={(v) => [`${v} sites`]} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* USWDS avg by bureau */}
            {showDapUswds && bureauUswdsData.length > 0 && (
              <ChartCard title="Avg USWDS Score by Bureau (top 12)">
                <ResponsiveContainer width="100%" height={290}>
                  <BarChart layout="vertical" data={bureauUswdsData} margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`${v}`, 'Avg USWDS score']} />
                    <Bar dataKey="uswds" fill={GOV_BLUE} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Top third-party domains */}
            {thirdPartyData.length > 0 && (
              <ChartCard title="Top Third-Party Domains">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart layout="vertical" data={thirdPartyData} margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={155} tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip formatter={(v) => [`${v} sites`, 'Appears on']} />
                    <Bar dataKey="sites" fill={GOV_BLUE_LIGHT} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Sites by bureau */}
            {bureauSiteData.length > 0 && (
              <ChartCard title="Sites by Bureau (top 10)">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={bureauSiteData} margin={{ top: 0, right: 16, left: 4, bottom: 70 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9 }}
                      angle={-38}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [`${v}`, 'Sites']} />
                    <Bar dataKey="sites" fill={GOV_BLUE} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Branch breakdown */}
            {branchData.length > 0 && (
              <ChartCard title="Sites by Branch">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={branchData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {branchData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} sites`]} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

          </div>
        </section>

      </div>
    </div>
  );
}
