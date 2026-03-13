import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable, type Table } from '../components/data-table/DataTable';
import FilterChips from '../components/data-table/FilterChips';
import ColumnToggle from '../components/data-table/ColumnToggle';
import Pagination from '../components/data-table/Pagination';
import SiteDetail from '../components/site-detail/SiteDetail';
import { DomainImportModal } from '../components/import/DomainImportModal';
import AgencyBureauFilter from '../components/AgencyBureauFilter';
import { useSites, useScanSessions } from '../hooks/useSites';
import { useHiddenSites } from '../hooks/useHiddenSites';
import { useUIStore } from '../store/uiStore';
import { useScanQueue } from '../contexts/ScanQueueContext';
import { api } from '../lib/api';
import type { View } from '../App';

const STATUS_COLORS: Record<number, string> = {
  200: 'badge-green', 301: 'badge-blue', 302: 'badge-blue',
  403: 'badge-yellow', 404: 'badge-red', 500: 'badge-red',
};

const COLUMNS: ColumnDef<Record<string, unknown>, any>[] = [
  {
    accessorKey: 'domain',
    header: 'Domain',
    size: 220,
    cell: (c) => (
      <span className="font-mono text-gov-blue font-medium">{String(c.getValue())}</span>
    ),
  },
  {
    accessorKey: 'agency',
    header: 'Agency',
    size: 180,
    cell: (c) => <span className="text-gray-700 truncate">{String(c.getValue() || '—')}</span>,
  },
  {
    accessorKey: 'domain_type',
    header: 'Type',
    size: 110,
    cell: (c) => {
      const v = String(c.getValue() || '');
      if (!v) return <span className="text-gray-300 text-xs">—</span>;
      // Values include "Federal - Executive", "City - Election", "State or territory", etc.
      const badgeCls = v.startsWith('Federal') ? 'badge-blue'
        : v.startsWith('State') ? 'badge-green'
        : v.startsWith('Tribal') ? 'badge-yellow'
        : 'badge-gray';
      return <span className={`badge ${badgeCls} text-xs`}>{v}</span>;
    },
  },
  {
    accessorKey: 'state',
    header: 'State',
    size: 55,
    cell: (c) => <span className="text-gray-500 font-mono text-xs">{String(c.getValue() || '—')}</span>,
  },
  {
    accessorKey: 'live',
    header: 'Live',
    size: 60,
    cell: (c) => {
      const v = c.getValue();
      return v === 1 || v === true
        ? <span className="badge badge-green">✓</span>
        : <span className="badge badge-red">✗</span>;
    },
  },
  {
    accessorKey: 'status_code',
    header: 'Status',
    size: 70,
    cell: (c) => {
      const code = c.getValue() as number;
      const cls = STATUS_COLORS[code] || 'badge-gray';
      return <span className={`badge ${cls}`}>{code}</span>;
    },
  },
  {
    accessorKey: 'uswds_count',
    header: 'USWDS',
    size: 70,
    cell: (c) => {
      const v = c.getValue() as number;
      if (!v) return <span className="text-gray-300">—</span>;
      return <span className={`badge ${v > 50 ? 'badge-green' : v > 0 ? 'badge-yellow' : 'badge-gray'}`}>{v}</span>;
    },
  },
  {
    accessorKey: 'dap',
    header: 'DAP',
    size: 55,
    cell: (c) => {
      const v = c.getValue();
      return v === 1 || v === true
        ? <span className="badge badge-green">✓</span>
        : <span className="text-gray-300 text-xs">—</span>;
    },
  },
  {
    accessorKey: 'sitemap_xml_detected',
    header: 'Sitemap',
    size: 70,
    cell: (c) => {
      const v = c.getValue();
      return v === 1 || v === true
        ? <span className="badge badge-green">✓</span>
        : <span className="badge badge-red">✗</span>;
    },
  },
  {
    accessorKey: 'https_enforced',
    header: 'HTTPS',
    size: 65,
    cell: (c) => {
      const v = c.getValue();
      return v === 1 || v === true
        ? <span className="badge badge-green">✓</span>
        : <span className="badge badge-red">✗</span>;
    },
  },
  {
    accessorKey: 'cms',
    header: 'CMS',
    size: 90,
    cell: (c) => <span className="text-gray-600">{String(c.getValue() || '—')}</span>,
  },
  {
    accessorKey: 'title',
    header: 'Page Title',
    size: 200,
    cell: (c) => <span className="text-gray-600 truncate">{String(c.getValue() || '—')}</span>,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  onNavigate: (view: View) => void;
}

export default function ExplorerView({ onNavigate }: Props) {
  const { scan, startScan, stopScan } = useScanQueue();
  const { openDetail, selectedDomain, detailPanelOpen, setReport, setFilter } = useUIStore();
  const { hidden, hide, unhide, clearAll: clearAllHidden } = useHiddenSites();
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState('domain');
  const [order, setOrder] = React.useState('asc');
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [tableInstance, setTableInstance] = React.useState<Table<any> | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [groupByFinalDomain, setGroupByFinalDomain] = React.useState(false);

  // Bulk selection state
  const [selectedDomains, setSelectedDomains] = React.useState<Set<string>>(new Set());
  const [selectAllLoading, setSelectAllLoading] = React.useState(false);

  const { data: scanSessions } = useScanSessions();

  // Agency / bureau filter — input values (what's typed) vs applied values (what queries use)
  const [agencyInput,  setAgencyInput]  = React.useState('');
  const [bureauInput,  setBureauInput]  = React.useState('');
  const [agencyFilter, setAgencyFilter] = React.useState('');
  const [bureauFilter, setBureauFilter] = React.useState('');

  // get.gov jurisdiction / location filters
  const [domainTypeFilter, setDomainTypeFilter] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState('');
  const { data: domainTypes = [] } = useQuery({ queryKey: ['domain-types'], queryFn: () => api.getDomainTypes() });

  // Overfetch to compensate for client-side hidden rows, capped at 100 total
  const fetchLimit = filters.show_hidden === 'true' ? 25 : Math.min(25 + hidden.size, 100);

  const queryParams = {
    page, limit: fetchLimit,
    sort: groupByFinalDomain ? 'final_domain' : sort,
    order: groupByFinalDomain ? 'asc' : order,
    ...filters,
    ...(agencyFilter ? { agency: agencyFilter } : {}),
    ...(bureauFilter ? { bureau: bureauFilter } : {}),
    ...(domainTypeFilter ? { domain_type: domainTypeFilter } : {}),
    ...(stateFilter ? { state: stateFilter } : {}),
  };
  const { data, isLoading } = useSites(queryParams);

  // Apply client-side hidden filter and cap at 25 visible rows
  const visibleRows = React.useMemo(() => {
    const rows: any[] = data?.data || [];
    if (filters.show_hidden === 'true') {
      return rows.filter((r) => hidden.has(String(r.domain)));
    }
    return rows.filter((r) => !hidden.has(String(r.domain))).slice(0, 25);
  }, [data, hidden, filters.show_hidden]);

  const handleFilter = React.useCallback((f: Record<string, string>) => {
    setFilters(f);
    setPage(1);
    setSelectedDomains(new Set()); // clear selection on filter change
  }, []);

  // When a suggestion is picked from the agency dropdown, apply it immediately and
  // clear any bureau filter (bureaus are scoped to an agency, so the old value is stale).
  const handleAgencySelect = React.useCallback((v: string) => {
    setAgencyInput(v);
    setAgencyFilter(v);
    setBureauInput('');
    setBureauFilter('');
    setPage(1);
    setSelectedDomains(new Set());
  }, []);

  // When a bureau suggestion is picked, apply it immediately.
  const handleBureauSelect = React.useCallback((v: string) => {
    setBureauInput(v);
    setBureauFilter(v);
    setPage(1);
    setSelectedDomains(new Set());
  }, []);

  // Apply button — commits whatever is currently typed (even if not from a suggestion).
  const handleAgencyBureauApply = React.useCallback(() => {
    setAgencyFilter(agencyInput);
    setBureauFilter(bureauInput);
    setPage(1);
    setSelectedDomains(new Set());
  }, [agencyInput, bureauInput]);

  // Clear button — wipes both inputs and applied filters.
  const handleAgencyBureauClear = React.useCallback(() => {
    setAgencyInput('');
    setBureauInput('');
    setAgencyFilter('');
    setBureauFilter('');
    setPage(1);
    setSelectedDomains(new Set());
  }, []);

  const handleSortChange = React.useCallback((col: string, ord: 'asc' | 'desc') => {
    setSort(col);
    setOrder(ord);
    setPage(1); // always start from page 1 when sort changes
  }, []);

  const toggleRow = React.useCallback((domain: string) => {
    setSelectedDomains((prev) => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      return next;
    });
  }, []);

  const toggleAll = React.useCallback((domains: string[]) => {
    setSelectedDomains((prev) => {
      const allSelected = domains.every((d) => prev.has(d));
      const next = new Set(prev);
      if (allSelected) {
        domains.forEach((d) => next.delete(d));
      } else {
        domains.forEach((d) => next.add(d));
      }
      return next;
    });
  }, []);

  const rangeToggle = React.useCallback((domains: string[]) => {
    setSelectedDomains((prev) => {
      const next = new Set(prev);
      domains.forEach((d) => next.add(d));
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedDomains(new Set());

  /** Fetch ALL matching rows (up to 1000) and bulk-select them */
  const selectAllMatching = async () => {
    setSelectAllLoading(true);
    try {
      const result = await api.getSites({
        ...filters,
        ...(agencyFilter ? { agency: agencyFilter } : {}),
        ...(bureauFilter ? { bureau: bureauFilter } : {}),
        page: 1,
        limit: 1000,
        sort,
        order,
      }) as any;
      const domains: string[] = (result?.data || []).map((r: any) => String(r.domain)).filter(Boolean);
      setSelectedDomains(new Set(domains));
    } finally {
      setSelectAllLoading(false);
    }
  };

  /** Rescan all selected domains via the global ScanQueueContext. */
  const rescanSelected = () => {
    if (scan.running) return;
    const domains = Array.from(selectedDomains);
    if (domains.length === 0) return;

    // Pass the current page's rows as a siteMap so the context can look up each
    // domain's existing URL and field values for diffing.
    const allRows: any[] = data?.data || [];
    const siteMap: Record<string, { url?: string; [key: string]: unknown }> = {};
    for (const row of allRows) {
      if (row.domain) siteMap[String(row.domain)] = row;
    }

    startScan({ domains, siteMap, label: 'Bulk rescan' });
  };

  /** Download selected rows as structured JSON for use with Glean or other tools */
  const exportSelected = () => {
    const allRows: any[] = data?.data || [];
    const rows = allRows.filter((r: any) => selectedDomains.has(String(r.domain)));
    if (rows.length === 0) return;

    const agencies = [...new Set(rows.map((r: any) => r.agency).filter(Boolean))];
    const bureaus  = [...new Set(rows.map((r: any) => r.bureau).filter(Boolean))];

    const payload = {
      agency: agencies.length === 1
        ? agencies[0]
        : agencies.length === 0 ? null : 'Multiple agencies',
      bureaus_and_offices: bureaus,
      exported_at: new Date().toISOString(),
      total: selectedDomains.size,
      domains: rows,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sites-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Navigate to the Dashboard report builder scoped to the current selection. */
  const generateDashboardReport = () => {
    const domains = Array.from(selectedDomains);
    if (domains.length === 0) return;
    setReport({ scope: 'selection', domains, createdAt: new Date().toISOString() });
    onNavigate('dashboard');
  };

  /** Navigate to the multi-site summary report (capped at 50). */
  const generateSummaryReport = () => {
    const domains = Array.from(selectedDomains).slice(0, 50);
    if (domains.length === 0) return;
    setReport({ scope: 'selection', domains, createdAt: new Date().toISOString() });
    onNavigate('multi-report');
  };

  /** Hide selected sites in this browser's personal view. */
  const hideSelected = () => {
    const domains = Array.from(selectedDomains);
    if (domains.length === 0) return;
    hide(domains);
    clearSelection();
  };

  /** Unhide selected sites from this browser's personal view. */
  const unhideSelected = () => {
    const domains = Array.from(selectedDomains);
    if (domains.length === 0) return;
    unhide(domains);
    clearSelection();
  };

  const totalResults = data?.total ?? 0;
  const pageSize = data?.data?.length ?? 0;
  const hasMoreThanOnePage = totalResults > pageSize && pageSize > 0;
  const selectedOnPage = (data?.data || []).filter((r: any) => selectedDomains.has(String(r.domain))).length;
  const showSelectAllBanner = selectedDomains.size > 0 && hasMoreThanOnePage && selectedDomains.size < totalResults;

  return (
    <div className="flex h-full relative">
      <div className={`flex flex-col flex-1 min-w-0 transition-all ${detailPanelOpen ? 'mr-[480px]' : ''}`}>

        {/* Filter chips + toolbar actions */}
        <div className="flex items-center justify-between pr-2">
          <FilterChips onFilter={handleFilter} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGroupByFinalDomain((v) => !v)}
              aria-pressed={groupByFinalDomain}
              title="Group sites by their final redirect target"
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                groupByFinalDomain
                  ? 'bg-gov-blue text-white border-gov-blue'
                  : 'bg-white text-gov-blue border-blue-300 hover:bg-blue-50'
              }`}
            >
              Group by redirect target
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="btn-secondary text-xs py-0.5 px-2"
              title="Add domains by pasting or dropping a text file"
            >
              + Add domains
            </button>
            <ColumnToggle table={tableInstance} />
          </div>
        </div>

        {/* Agency / bureau filter row */}
        <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap px-4 py-2 border-b border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500 font-medium shrink-0">Browse by:</span>
          <AgencyBureauFilter
            agency={agencyInput}
            bureau={bureauInput}
            onAgencyChange={setAgencyInput}
            onBureauChange={setBureauInput}
            onAgencySelect={handleAgencySelect}
            onBureauSelect={handleBureauSelect}
            onApply={handleAgencyBureauApply}
            onClear={handleAgencyBureauClear}
            hasFilter={!!(agencyInput || bureauInput)}
          />
          {(agencyFilter || bureauFilter) && (
            <span className="text-xs text-gov-blue bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 shrink-0">
              {[agencyFilter, bureauFilter].filter(Boolean).join(' › ')}
            </span>
          )}
          {domainTypes.length > 0 && (
            <select
              value={domainTypeFilter}
              onChange={(e) => { setDomainTypeFilter(e.target.value); setPage(1); }}
              className="text-xs border border-gray-200 rounded px-2 py-0.5 bg-white text-gray-700 shrink-0"
              aria-label="Filter by government type"
            >
              <option value="">All types</option>
              {domainTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value.toUpperCase().slice(0, 2)); setPage(1); }}
            placeholder="State"
            maxLength={2}
            className="text-xs border border-gray-200 rounded px-2 py-0.5 bg-white text-gray-700 w-14 shrink-0 font-mono"
            aria-label="Filter by state"
          />
        </div>

        <DomainImportModal open={importOpen} onOpenChange={setImportOpen} />

        {/* Personal hidden sites banner */}
        {hidden.size > 0 && filters.show_hidden !== 'true' && (
          <div className="px-4 py-1 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-700 flex items-center gap-2">
            <span>
              {hidden.size} site{hidden.size !== 1 ? 's' : ''} hidden in your personal view
            </span>
            <button
              onClick={() => setFilter('show_hidden', 'true')}
              className="underline hover:text-yellow-900"
            >
              show them
            </button>
            <span aria-hidden="true">·</span>
            <button onClick={clearAllHidden} className="underline hover:text-yellow-900">
              reset view
            </button>
          </div>
        )}

        {/* Scan history bar — shown when sessions exist and not currently scanning */}
        {!scan.running && Array.isArray(scanSessions) && scanSessions.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 border-b border-gray-200 text-xs">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
              aria-expanded={historyOpen}
            >
              <span aria-hidden="true">{historyOpen ? '▾' : '▸'}</span>
              Scan history ({scanSessions.length})
            </button>
            {!historyOpen && (
              <span className="text-gray-400">
                Last: {(scanSessions[0] as any).label || '(unlabeled)'}
                {' — '}
                {(scanSessions[0] as any).status === 'running' ? (
                  <span className="text-blue-600">still running</span>
                ) : (scanSessions[0] as any).status === 'completed' ? (
                  <span className="text-green-600">✓ completed</span>
                ) : (
                  <span className="text-yellow-600">⏹ stopped</span>
                )}
                {' · '}
                {formatRelativeTime(String((scanSessions[0] as any).started_at))}
              </span>
            )}
          </div>
        )}

        {/* Expanded scan history list */}
        {historyOpen && Array.isArray(scanSessions) && scanSessions.length > 0 && (
          <div className="border-b border-gray-200 bg-gray-50">
            <table className="w-full text-xs" aria-label="Scan history">
              <thead>
                <tr className="text-gray-400 border-b border-gray-200">
                  <th className="text-left px-3 py-1 font-medium">Label</th>
                  <th className="text-left px-3 py-1 font-medium">Status</th>
                  <th className="text-right px-3 py-1 font-medium">Domains</th>
                  <th className="text-right px-3 py-1 font-medium">Done</th>
                  <th className="text-right px-3 py-1 font-medium">Failed</th>
                  <th className="text-right px-3 py-1 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {(scanSessions as any[]).map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-100">
                    <td className="px-3 py-1 text-gray-700">{s.label || <span className="text-gray-400 italic">—</span>}</td>
                    <td className="px-3 py-1">
                      {s.status === 'running' && <span className="text-blue-600">🔄 running</span>}
                      {s.status === 'completed' && <span className="text-green-600">✓ done</span>}
                      {s.status === 'stopped' && <span className="text-yellow-600">⏹ stopped</span>}
                    </td>
                    <td className="px-3 py-1 text-right text-gray-500">{s.total_domains}</td>
                    <td className="px-3 py-1 text-right text-green-600">{s.completed_count}</td>
                    <td className="px-3 py-1 text-right text-red-500">{s.failed_count || '—'}</td>
                    <td className="px-3 py-1 text-right text-gray-400">{formatRelativeTime(String(s.started_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bulk selection action bar — only shown when rows are selected */}
        {selectedDomains.size > 0 && (
          <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-xs flex-wrap">
            <span className="text-blue-700 font-medium">
              <span aria-hidden="true">✓ </span>{selectedDomains.size.toLocaleString()} selected
              {selectedOnPage < selectedDomains.size && ` (${selectedOnPage} on this page)`}
            </span>
            <button onClick={exportSelected} disabled={scan.running} className="btn-primary text-xs py-0.5 px-2">
              Export JSON <span aria-hidden="true">↓</span>
            </button>
            <button
              onClick={generateDashboardReport}
              disabled={scan.running}
              className="btn-secondary text-xs py-0.5 px-2"
              title="Open aggregate report for these sites in Dashboard"
            >
              Dashboard report →
            </button>
            {selectedDomains.size >= 2 && (
              <button
                onClick={generateSummaryReport}
                disabled={scan.running}
                className="btn-secondary text-xs py-0.5 px-2"
                title={selectedDomains.size > 50 ? `Summary for first 50 of ${selectedDomains.size} selected` : undefined}
              >
                Summary report{selectedDomains.size > 50 ? ` (first 50 →)` : ' →'}
              </button>
            )}
            {!scan.running ? (
              <button onClick={rescanSelected} className="btn-secondary text-xs py-0.5 px-2">
                <span aria-hidden="true">🔄 </span>Rescan selected
              </button>
            ) : (
              <button onClick={stopScan} className="btn-secondary text-xs py-0.5 px-2 text-red-600 border-red-300">
                <span aria-hidden="true">⏹ </span>Stop
              </button>
            )}
            {filters.show_hidden === 'true' ? (
              <button
                onClick={unhideSelected}
                disabled={scan.running}
                className="btn-secondary text-xs py-0.5 px-2 text-green-700 border-green-300"
                title="Restore these sites to your personal view"
              >
                ✓ Unhide selected ({selectedDomains.size})
              </button>
            ) : (
              <button
                onClick={hideSelected}
                disabled={scan.running}
                className="btn-secondary text-xs py-0.5 px-2 text-red-600 border-red-300"
                title="Hide these sites from your personal view (only affects this browser)"
              >
                Hide selected ({selectedDomains.size})
              </button>
            )}
            <button onClick={clearSelection} disabled={scan.running} className="btn-secondary text-xs py-0.5 px-2">
              Clear selection
            </button>
            {showSelectAllBanner && !scan.running && (
              <button
                onClick={selectAllMatching}
                disabled={selectAllLoading}
                className="text-blue-600 underline hover:text-blue-800 disabled:opacity-50 ml-1"
              >
                {selectAllLoading
                  ? 'Loading…'
                  : `Select all ${totalResults.toLocaleString()} matching →`}
              </button>
            )}
            {/* Bulk rescan progress */}
            {scan.running && (
              <span className="text-blue-700 ml-1" role="status" aria-live="polite" aria-atomic="true">
                Scanning {scan.current.length} at a time —{' '}
                {scan.done + scan.failed} of {scan.total} done
                {scan.failed > 0 && (
                  <span className="text-red-500 ml-1">({scan.failed} failed)</span>
                )}
              </span>
            )}
          </div>
        )}

        <DataTable
          data={visibleRows}
          columns={COLUMNS}
          onRowClick={(row) => openDetail(String(row.domain))}
          selectedKey={selectedDomain}
          isLoading={isLoading}
          emptyMessage="No sites found. Drop a JSON file to import data."
          onTableReady={setTableInstance}
          selectable
          selectedRows={selectedDomains}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          onRangeToggle={rangeToggle}
          sortColumn={groupByFinalDomain ? 'final_domain' : sort}
          sortOrder={groupByFinalDomain ? 'asc' : (order as 'asc' | 'desc')}
          onSortChange={groupByFinalDomain ? undefined : handleSortChange}
          groupBy={groupByFinalDomain ? (row: any) => String(row.final_domain ?? row.domain) : undefined}
        />

        {data && (
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            limit={data.limit}
            onPage={setPage}
          />
        )}
      </div>
      <SiteDetail onNavigate={onNavigate} />
    </div>
  );
}
