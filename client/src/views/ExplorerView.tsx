import React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { DataTable, type Table } from '../components/data-table/DataTable';
import FilterChips from '../components/data-table/FilterChips';
import ColumnToggle from '../components/data-table/ColumnToggle';
import Pagination from '../components/data-table/Pagination';
import SiteDetail from '../components/site-detail/SiteDetail';
import { DomainImportModal } from '../components/import/DomainImportModal';
import { useSites } from '../hooks/useSites';
import { useUIStore } from '../store/uiStore';
import { api } from '../lib/api';

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

/** Run up to `concurrency` async tasks at a time from `items`, calling `task` for each. */
async function pLimit<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
  shouldAbort: () => boolean,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0 && !shouldAbort()) {
      const item = queue.shift()!;
      await task(item);
    }
  });
  await Promise.allSettled(workers);
}

interface BulkScanState {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  current: string[]; // domains actively scanning right now
}

const BULK_CONCURRENCY = 3; // scans in parallel at a time

export default function ExplorerView() {
  const qc = useQueryClient();
  const { openDetail, selectedDomain, detailPanelOpen } = useUIStore();
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState('domain');
  const [order, setOrder] = React.useState('asc');
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [tableInstance, setTableInstance] = React.useState<Table<any> | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  // Bulk selection state
  const [selectedDomains, setSelectedDomains] = React.useState<Set<string>>(new Set());
  const [selectAllLoading, setSelectAllLoading] = React.useState(false);

  // Bulk rescan state
  const [bulkScan, setBulkScan] = React.useState<BulkScanState>({
    running: false, total: 0, done: 0, failed: 0, current: [],
  });
  const bulkAbortedRef = React.useRef(false);

  const queryParams = { page, limit: 25, sort, order, ...filters };
  const { data, isLoading } = useSites(queryParams);

  const handleFilter = React.useCallback((f: Record<string, string>) => {
    setFilters(f);
    setPage(1);
    setSelectedDomains(new Set()); // clear selection on filter change
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

  const clearSelection = () => setSelectedDomains(new Set());

  /** Fetch ALL matching rows (up to 1000) and bulk-select them */
  const selectAllMatching = async () => {
    setSelectAllLoading(true);
    try {
      const result = await api.getSites({ ...filters, page: 1, limit: 1000, sort, order }) as any;
      const domains: string[] = (result?.data || []).map((r: any) => String(r.domain)).filter(Boolean);
      setSelectedDomains(new Set(domains));
    } finally {
      setSelectAllLoading(false);
    }
  };

  /** Rescan all selected domains, 3 at a time, with live progress. */
  const rescanSelected = async () => {
    if (bulkScan.running) return;
    const domains = Array.from(selectedDomains);
    if (domains.length === 0) return;

    // Fetch full site records for URL lookup (url field may differ from domain)
    const allRows: any[] = data?.data || [];
    const siteMap: Record<string, any> = {};
    for (const row of allRows) {
      if (row.domain) siteMap[String(row.domain)] = row;
    }

    bulkAbortedRef.current = false;
    setBulkScan({ running: true, total: domains.length, done: 0, failed: 0, current: [] });

    const { scanSite } = await import('../scanner/orchestrator');
    const { computeDiff } = await import('../lib/diff');

    await pLimit(
      domains,
      BULK_CONCURRENCY,
      async (domain) => {
        if (bulkAbortedRef.current) return;

        setBulkScan((prev) => ({ ...prev, current: [...prev.current, domain] }));

        try {
          const site = siteMap[domain] || {};
          const url = String(site.url || `https://${domain}`);
          const result = await scanSite(url);

          if (bulkAbortedRef.current) return; // don't save if stopped

          // Build diff (same logic as RescanPanel)
          const scanFields: Record<string, unknown> = {};
          if (result.tech_stack) {
            const ts = result.tech_stack;
            Object.assign(scanFields, {
              cms: ts.cms, web_server: ts.web_server, cdn_provider: ts.cdn,
              hosting_provider: ts.hosting_provider,
              https_enforced: ts.https_enforced, hsts: ts.hsts,
            });
            if (ts.dap) Object.assign(scanFields, { dap: ts.dap.detected, ga_tag_id: ts.dap.ga_tag_id });
            if (ts.wordpress) Object.assign(scanFields, { wp_version: ts.wordpress.version, wp_theme: ts.wordpress.theme });
          }
          if (result.sitemap) Object.assign(scanFields, { sitemap_xml_detected: result.sitemap.detected });
          if (result.robots)  Object.assign(scanFields, { robots_txt_detected: result.robots.detected });
          if (result.dns)     Object.assign(scanFields, { ipv6: result.dns.ipv6 });

          const relevantSiteFields: Record<string, unknown> = {};
          for (const key of Object.keys(scanFields)) relevantSiteFields[key] = site[key];
          const diff = computeDiff(relevantSiteFields, scanFields);

          await api.postScan(domain, result, diff);

          setBulkScan((prev) => ({
            ...prev,
            done: prev.done + 1,
            current: prev.current.filter((d) => d !== domain),
          }));
        } catch {
          setBulkScan((prev) => ({
            ...prev,
            failed: prev.failed + 1,
            current: prev.current.filter((d) => d !== domain),
          }));
        }
      },
      () => bulkAbortedRef.current,
    );

    setBulkScan((prev) => ({ ...prev, running: false, current: [] }));
    qc.invalidateQueries({ queryKey: ['sites'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const stopBulkRescan = () => {
    bulkAbortedRef.current = true;
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
              onClick={() => setImportOpen(true)}
              className="btn-secondary text-xs py-0.5 px-2"
              title="Add domains by pasting or dropping a text file"
            >
              + Add domains
            </button>
            <ColumnToggle table={tableInstance} />
          </div>
        </div>

        <DomainImportModal open={importOpen} onOpenChange={setImportOpen} />

        {/* Bulk selection action bar — only shown when rows are selected */}
        {selectedDomains.size > 0 && (
          <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-xs flex-wrap">
            <span className="text-blue-700 font-medium">
              ✓ {selectedDomains.size.toLocaleString()} selected
              {selectedOnPage < selectedDomains.size && ` (${selectedOnPage} on this page)`}
            </span>
            <button onClick={exportSelected} disabled={bulkScan.running} className="btn-primary text-xs py-0.5 px-2">
              Export JSON ↓
            </button>
            {!bulkScan.running ? (
              <button onClick={rescanSelected} className="btn-secondary text-xs py-0.5 px-2">
                🔄 Rescan selected
              </button>
            ) : (
              <button onClick={stopBulkRescan} className="btn-secondary text-xs py-0.5 px-2 text-red-600 border-red-300">
                ⏹ Stop
              </button>
            )}
            <button onClick={clearSelection} disabled={bulkScan.running} className="btn-secondary text-xs py-0.5 px-2">
              Clear selection
            </button>
            {showSelectAllBanner && !bulkScan.running && (
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
            {bulkScan.running && (
              <span className="text-blue-700 ml-1">
                Scanning {bulkScan.current.length} at a time —{' '}
                {bulkScan.done + bulkScan.failed} of {bulkScan.total} done
                {bulkScan.failed > 0 && (
                  <span className="text-red-500 ml-1">({bulkScan.failed} failed)</span>
                )}
              </span>
            )}
            {!bulkScan.running && bulkScan.total > 0 && (
              <span className="text-green-700 ml-1">
                ✓ Rescan complete — {bulkScan.done} updated
                {bulkScan.failed > 0 && (
                  <span className="text-red-500 ml-1">, {bulkScan.failed} failed</span>
                )}
              </span>
            )}
          </div>
        )}

        <DataTable
          data={data?.data || []}
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
          sortColumn={sort}
          sortOrder={order as 'asc' | 'desc'}
          onSortChange={handleSortChange}
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
      <SiteDetail />
    </div>
  );
}
