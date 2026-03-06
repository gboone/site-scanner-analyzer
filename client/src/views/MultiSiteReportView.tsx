import React, { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useUIStore } from '../store/uiStore';
import { useStats } from '../hooks/useSites';
import { api } from '../lib/api';
import type { View } from '../App';
import type { StatsResponse } from 'shared';

interface Props {
  onNavigate: (view: View) => void;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

function pct(n: number, total: number) {
  if (!total) return '—';
  return `${Math.round((n / total) * 100)}%`;
}

function bool(v: unknown) {
  return v === 1 || v === true || v === '1';
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

type SortKey = 'domain' | 'live' | 'redirect' | 'https' | 'hsts' | 'uswds' | 'dap' | 'sitemap' | 'cms' | 'scan_date';

export default function MultiSiteReportView({ onNavigate }: Props) {
  const { reportConfig, clearReport } = useUIStore();
  const [sortKey, setSortKey] = useState<SortKey>('domain');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const domains = useMemo(
    () => (reportConfig?.domains ?? []).slice(0, 50),
    [reportConfig]
  );

  // Aggregate stats for these domains
  const { data: stats, isLoading: statsLoading } = useStats(
    domains.length ? { domains } : undefined
  ) as { data: StatsResponse | undefined; isLoading: boolean };

  // Individual site data (parallel)
  const siteQueries = useQueries({
    queries: domains.map((domain) => ({
      queryKey: ['site', domain],
      queryFn: () => api.getSite(domain) as Promise<{ site: Record<string, unknown> }>,
      staleTime: 10 * 60 * 1000,
    })),
  });

  const allLoaded = siteQueries.every((q) => !q.isLoading);
  const sites = useMemo(
    () => siteQueries.map((q) => q.data?.site ?? null).filter(Boolean) as Record<string, unknown>[],
    [siteQueries]
  );

  const handleExportJSON = () => {
    const payload = { reportConfig, stats, sites };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multi-site-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedSites = useMemo(() => {
    const s = [...sites];
    s.sort((a, b) => {
      let av: unknown, bv: unknown;
      switch (sortKey) {
        case 'domain':   av = a.domain;           bv = b.domain;           break;
        case 'live':     av = bool(a.live) ? 1 : 0;  bv = bool(b.live) ? 1 : 0; break;
        case 'redirect': av = bool(a.redirect) ? 1 : 0; bv = bool(b.redirect) ? 1 : 0; break;
        case 'https':    av = bool(a.https_enforced) ? 1 : 0; bv = bool(b.https_enforced) ? 1 : 0; break;
        case 'hsts':     av = bool(a.hsts) ? 1 : 0; bv = bool(b.hsts) ? 1 : 0; break;
        case 'uswds':    av = Number(a.uswds_count ?? 0); bv = Number(b.uswds_count ?? 0); break;
        case 'dap':      av = bool(a.dap) ? 1 : 0; bv = bool(b.dap) ? 1 : 0; break;
        case 'sitemap':  av = bool(a.sitemap_xml_detected) ? 1 : 0; bv = bool(b.sitemap_xml_detected) ? 1 : 0; break;
        case 'cms':      av = String(a.cms ?? ''); bv = String(b.cms ?? ''); break;
        case 'scan_date': av = String(a.scan_date ?? ''); bv = String(b.scan_date ?? ''); break;
        default:         av = a[sortKey]; bv = b[sortKey];
      }
      if (av === bv) return 0;
      const cmp = av! < bv! ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return s;
  }, [sites, sortKey, sortDir]);

  // ── Chart data ──────────────────────────────────────────────────────────
  const httpsData = stats
    ? [
        { name: 'Enforced', value: stats.https_enforced_count },
        { name: 'Not enforced', value: stats.total_sites - stats.https_enforced_count },
      ]
    : [];

  const uswdsData = stats
    ? [
        { name: 'USWDS', value: stats.uswds_any_count },
        { name: 'No USWDS', value: stats.total_sites - stats.uswds_any_count },
      ]
    : [];

  const cmsData = (stats?.by_cms ?? [])
    .slice(0, 8)
    .map((r) => ({ name: r.cms || 'Unknown', value: r.count }));

  // ── Empty / error states ─────────────────────────────────────────────────
  if (!reportConfig || domains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <p>No sites selected. Choose sites in Explorer first.</p>
        <button onClick={() => onNavigate('explorer')} className="btn-secondary text-sm">
          ← Back to Explorer
        </button>
      </div>
    );
  }

  const scopeLabel = reportConfig.label
    ?? (reportConfig.scope === 'sql' ? 'SQL query results' : 'Selected sites');
  const total = stats?.total_sites ?? domains.length;

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function Th({ col, children }: { col: SortKey; children: React.ReactNode }) {
    return (
      <th
        className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none"
        onClick={() => handleSort(col)}
      >
        {children}<SortIcon col={col} />
      </th>
    );
  }

  function BoolCell({ v }: { v: unknown }) {
    if (v === null || v === undefined) return <span className="text-gray-300">—</span>;
    return bool(v)
      ? <span className="badge badge-green">Yes</span>
      : <span className="badge badge-red">No</span>;
  }

  return (
    <div className="flex flex-col h-full overflow-auto print:overflow-visible">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 px-8 py-5 border-b border-gray-200 bg-white print:border-b-2 print:border-gray-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <button onClick={() => onNavigate('explorer')} className="hover:text-gray-800 print:hidden">
              ← Explorer
            </button>
            <span className="print:hidden">/</span>
            <span className="truncate">{scopeLabel}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Multi-Site Report
            <span className="ml-2 text-base font-normal text-gray-500">
              {domains.length} site{domains.length !== 1 ? 's' : ''}
              {reportConfig?.domains && reportConfig.domains.length > 50
                ? ` (first 50 of ${reportConfig.domains.length})`
                : ''}
            </span>
          </h1>
          {reportConfig.createdAt && (
            <p className="text-xs text-gray-400 mt-0.5">
              Generated {new Date(reportConfig.createdAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 print:hidden">
          <button onClick={handleExportJSON} className="btn-secondary text-xs py-1 px-2">
            JSON ↓
          </button>
          <button onClick={() => window.print()} className="btn-primary text-xs py-1 px-2">
            Print / PDF
          </button>
          <button
            onClick={() => { clearReport(); onNavigate('explorer'); }}
            className="btn-secondary text-xs py-1 px-2"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 px-8 py-6 space-y-8 max-w-6xl mx-auto w-full">

        {statsLoading && (
          <p className="text-gray-400 text-sm">Loading aggregate stats…</p>
        )}

        {/* ── Summary stat tiles ───────────────────────────────────────── */}
        {stats && (
          <section aria-label="Summary stats">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="Total" value={total} />
              <StatTile
                label="Live"
                value={pct(stats.live_count, total)}
                sub={`${stats.live_count} sites`}
                good={stats.live_pct >= 90}
              />
              <StatTile
                label="HTTPS"
                value={pct(stats.https_enforced_count, total)}
                sub={`${stats.https_enforced_count} sites`}
                good={stats.https_enforced_pct >= 90}
              />
              <StatTile
                label="USWDS"
                value={pct(stats.uswds_any_count, total)}
                sub={`${stats.uswds_any_count} sites`}
              />
              <StatTile
                label="DAP"
                value={pct(stats.dap_count, total)}
                sub={`${stats.dap_count} sites`}
              />
              <StatTile
                label="Sitemap"
                value={pct(stats.sitemap_detected_count, total)}
                sub={`${stats.sitemap_detected_count} sites`}
              />
            </div>
          </section>
        )}

        {/* ── Charts row ───────────────────────────────────────────────── */}
        {stats && (
          <section aria-label="Charts">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* HTTPS donut */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">HTTPS Enforcement</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={httpsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      <Cell fill="#10b981" />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                    <Tooltip formatter={(v) => [v, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* USWDS donut */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">USWDS Adoption</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={uswdsData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      <Cell fill="#3b82f6" />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                    <Tooltip formatter={(v) => [v, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* CMS bar */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">CMS Mix</h3>
                {cmsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
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
              </div>
            </div>
          </section>
        )}

        {/* ── Comparison table ─────────────────────────────────────────── */}
        <section aria-label="Site comparison">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Site Comparison
            {!allLoaded && <span className="ml-2 text-gray-300 font-normal normal-case">loading…</span>}
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <Th col="domain">Domain</Th>
                    <Th col="live">Live</Th>
                    <Th col="redirect">Redirects</Th>
                    <Th col="https">HTTPS</Th>
                    <Th col="hsts">HSTS</Th>
                    <Th col="uswds">USWDS</Th>
                    <Th col="dap">DAP</Th>
                    <Th col="sitemap">Sitemap</Th>
                    <Th col="cms">CMS</Th>
                    <Th col="scan_date">Last Scan</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedSites.map((site) => (
                    <tr
                      key={String(site.domain)}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        useUIStore.getState().openDetail(String(site.domain));
                        onNavigate('site-report');
                      }}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-blue-700 hover:underline">
                        {String(site.domain)}
                      </td>
                      <td className="px-3 py-2"><BoolCell v={site.live} /></td>
                      <td className="px-3 py-2">
                        {bool(site.redirect) ? (() => {
                          let host: string | null = null;
                          try { if (site.url) host = new URL(String(site.url)).hostname; } catch { /* empty */ }
                          return (
                            <span className="badge badge-gray text-xs" title={host ?? undefined}>
                              → {host ?? '?'}
                            </span>
                          );
                        })() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2"><BoolCell v={site.https_enforced} /></td>
                      <td className="px-3 py-2"><BoolCell v={site.hsts} /></td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {site.uswds_count != null ? String(site.uswds_count) : '—'}
                      </td>
                      <td className="px-3 py-2"><BoolCell v={site.dap} /></td>
                      <td className="px-3 py-2"><BoolCell v={site.sitemap_xml_detected} /></td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {site.cms ? String(site.cms) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">
                        {site.scan_date
                          ? new Date(String(site.scan_date)).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {sites.length === 0 && allLoaded && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">
                        No site data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
