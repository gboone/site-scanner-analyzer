/**
 * useExplorerUrlSync — bidirectional URL sync for ExplorerView state.
 *
 * Reads initial values from the URL hash on mount, and provides a
 * `syncExplorerState` function that ExplorerView calls (via useEffect)
 * whenever permalink-relevant state changes.
 */

import React from 'react';
import { useUrlSync, encodeB64, decodeB64 } from './useUrlSync';
import type { Table } from '../components/data-table/DataTable';

export type ColFilterEntry = { value: string; mode: string };

export interface ExplorerSyncState {
  sort: string;
  order: string;
  groupByField: string | null;
  groupByOrder: 'asc' | 'desc';
  page: number;
  extraColumns: string[];
  columnFilters: Record<string, ColFilterEntry>;
  domainTypeFilter: string;
  stateFilter: string;
  agencyFilter: string;
  bureauFilter: string;
  search: string;
  activeFilters: Record<string, string | boolean>;
  tableInstance: Table<any> | null;
  domain: string | null;
  detailPanelOpen: boolean;
}

function parseExtraCols(cols: string | undefined): string[] {
  if (cols) return cols.split(',').filter(Boolean);
  // Fall back to localStorage for non-permalink sessions
  try {
    const raw = localStorage.getItem('site_scanner_extra_columns');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function parseHiddenCols(hiddenCols: string | undefined): Record<string, boolean> {
  if (!hiddenCols) return {};
  return Object.fromEntries(hiddenCols.split(',').filter(Boolean).map((k) => [k, false]));
}

function parseCf(encoded: string | undefined): Record<string, ColFilterEntry> {
  if (!encoded) return {};
  try {
    const decoded = decodeB64(encoded);
    return decoded ? JSON.parse(decoded) : {};
  } catch {
    return {};
  }
}

function parseFilters(encoded: string | undefined): Record<string, string | boolean> {
  if (!encoded) return {};
  try {
    return JSON.parse(encoded);
  } catch {
    return {};
  }
}

export interface ExplorerInitialState {
  sort: string;
  order: string;
  groupByField: string | null;
  groupByOrder: 'asc' | 'desc';
  page: number;
  extraColumns: string[];
  hiddenColumns: Record<string, boolean>;
  columnFilters: Record<string, ColFilterEntry>;
  domainTypeFilter: string;
  stateFilter: string;
  agencyFilter: string;
  bureauFilter: string;
  search: string;
  activeFilters: Record<string, string | boolean>;
}

export function useExplorerUrlSync() {
  const { initialState, syncToUrl } = useUrlSync();

  const initial = React.useMemo<ExplorerInitialState>(() => ({
    sort: initialState.sort ?? 'domain',
    order: initialState.order ?? 'asc',
    groupByField: initialState.groupBy ?? null,
    groupByOrder: (initialState.groupByOrder ?? 'asc') as 'asc' | 'desc',
    page: initialState.page ?? 1,
    extraColumns: parseExtraCols(initialState.cols),
    hiddenColumns: parseHiddenCols(initialState.hiddenCols),
    columnFilters: parseCf(initialState.cf),
    domainTypeFilter: initialState.domainType ?? '',
    stateFilter: initialState.st ?? '',
    agencyFilter: initialState.agency ?? '',
    bureauFilter: initialState.bureau ?? '',
    search: initialState.search ?? '',
    activeFilters: parseFilters(initialState.filters),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncExplorerState = React.useCallback((state: ExplorerSyncState) => {
    // Encode column filters as base64 JSON (only active ones)
    const activeCf = Object.fromEntries(
      Object.entries(state.columnFilters).filter(([, v]) => v.value)
    );
    const cfEncoded = Object.keys(activeCf).length
      ? encodeB64(JSON.stringify(activeCf))
      : undefined;

    // Extract hidden column keys from TanStack table visibility state
    let hiddenCols: string | undefined;
    if (state.tableInstance) {
      const visibility = state.tableInstance.getState().columnVisibility;
      const hiddenKeys = Object.entries(visibility)
        .filter(([, visible]) => visible === false)
        .map(([key]) => key);
      hiddenCols = hiddenKeys.length ? hiddenKeys.join(',') : undefined;
    }

    syncToUrl({
      view: 'explorer',
      domain: state.detailPanelOpen && state.domain ? state.domain : undefined,
      search: state.search || undefined,
      agency: state.agencyFilter || undefined,
      bureau: state.bureauFilter || undefined,
      filters: Object.keys(state.activeFilters).length
        ? JSON.stringify(state.activeFilters)
        : undefined,
      sort: state.sort,
      order: state.order,
      groupBy: state.groupByField ?? undefined,
      groupByOrder: state.groupByOrder,
      page: state.page,
      cols: state.extraColumns.length ? state.extraColumns.join(',') : undefined,
      hiddenCols,
      cf: cfEncoded,
      domainType: state.domainTypeFilter || undefined,
      st: state.stateFilter || undefined,
    });
  }, [syncToUrl]);

  return { initial, syncExplorerState };
}
