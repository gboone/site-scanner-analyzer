/**
 * useUrlSync — hash-based URL state persistence.
 *
 * Serialises the key pieces of app state (current view, open domain, explorer
 * filters, report config, SQL query) into the URL hash so any user can copy
 * the address bar and send it to a colleague who will land on the exact same view.
 *
 * Uses window.location.hash (not pathname) so the server's catch-all route
 * always serves index.html regardless of what's in the hash.
 *
 * Usage: call once in App.tsx.  The hook returns:
 *   - initialState  — values parsed from the hash on first render (use to seed state)
 *   - syncToUrl()   — call whenever state changes to write the hash
 */

import React from 'react';
import type { ReportConfig } from '../store/uiStore';
import type { View } from '../App';

export interface UrlState {
  view?: View;
  domain?: string;        // open in detail panel
  search?: string;
  agency?: string;
  bureau?: string;
  filters?: string;       // JSON-encoded chip filters
  report?: string;        // base64-encoded ReportConfig
  sql?: string;           // base64-encoded SQL query
}

function parseHash(): UrlState {
  const hash = window.location.hash.slice(1); // strip leading '#'
  if (!hash) return {};
  try {
    const params = new URLSearchParams(hash);
    const state: UrlState = {};
    const view = params.get('view');
    if (view) state.view = view as View;
    const domain = params.get('domain');
    if (domain) state.domain = domain;
    const search = params.get('search');
    if (search) state.search = search;
    const agency = params.get('agency');
    if (agency) state.agency = agency;
    const bureau = params.get('bureau');
    if (bureau) state.bureau = bureau;
    const filters = params.get('filters');
    if (filters) state.filters = filters;
    const report = params.get('report');
    if (report) state.report = report;
    const sql = params.get('sql');
    if (sql) state.sql = sql;
    return state;
  } catch {
    return {};
  }
}

function buildHash(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.view && state.view !== 'explorer') params.set('view', state.view);
  if (state.domain) params.set('domain', state.domain);
  if (state.search) params.set('search', state.search);
  if (state.agency) params.set('agency', state.agency);
  if (state.bureau) params.set('bureau', state.bureau);
  if (state.filters) params.set('filters', state.filters);
  if (state.report) params.set('report', state.report);
  if (state.sql) params.set('sql', state.sql);
  return params.toString();
}

/** Encode a ReportConfig to a URL-safe base64 string. */
export function encodeReport(config: ReportConfig): string {
  return btoa(encodeURIComponent(JSON.stringify(config)));
}

/** Decode a base64 ReportConfig string; returns null on failure. */
export function decodeReport(encoded: string): ReportConfig | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

/** Encode an arbitrary string (e.g. SQL) to base64. */
export function encodeB64(value: string): string {
  return btoa(encodeURIComponent(value));
}

/** Decode a base64 string; returns null on failure. */
export function decodeB64(encoded: string): string | null {
  try {
    return decodeURIComponent(atob(encoded));
  } catch {
    return null;
  }
}

export function useUrlSync() {
  const initialState = React.useMemo(() => parseHash(), []);

  const syncToUrl = React.useCallback((state: UrlState) => {
    const hash = buildHash(state);
    const newHash = hash ? `#${hash}` : '#';
    // replaceState so the browser back-button doesn't accumulate hash changes
    window.history.replaceState(null, '', newHash || window.location.pathname);
  }, []);

  /** Copies the current URL (with hash) to the clipboard. */
  const copyLink = React.useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { initialState, syncToUrl, copyLink };
}
