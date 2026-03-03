import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanQueueState {
  running: boolean;
  /** Server-side session id — null if session creation failed or no scan yet */
  sessionId: number | null;
  /** Human-readable label set by the caller (e.g. "Bulk rescan", "Scan & import") */
  label: string;
  total: number;
  done: number;
  failed: number;
  /** Domains currently being scanned (in-flight) */
  current: string[];
  errors: { domain: string; message: string }[];
}

const INITIAL_STATE: ScanQueueState = {
  running: false,
  sessionId: null,
  label: '',
  total: 0,
  done: 0,
  failed: 0,
  current: [],
  errors: [],
};

export interface StartScanArgs {
  domains: string[];
  /**
   * URL / field lookup keyed by domain.
   * Omit (or leave a domain out) for new domains with no prior DB record —
   * the scan will default to https://{domain} and diff against an empty baseline.
   */
  siteMap?: Record<string, { url?: string; [key: string]: unknown }>;
  /** Short label surfaced in the Shell indicator and scan-session log */
  label?: string;
}

interface ScanQueueContextType {
  scan: ScanQueueState;
  startScan: (args: StartScanArgs) => Promise<void>;
  stopScan: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ScanQueueContext = React.createContext<ScanQueueContextType | null>(null);

export function useScanQueue(): ScanQueueContextType {
  const ctx = React.useContext(ScanQueueContext);
  if (!ctx) throw new Error('useScanQueue must be used within ScanQueueProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function pLimit<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
  shouldAbort: () => boolean,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0 && !shouldAbort()) {
        const item = queue.shift()!;
        await task(item);
      }
    }
  );
  await Promise.allSettled(workers);
}

const CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ScanQueueProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [scan, setScan] = React.useState<ScanQueueState>(INITIAL_STATE);

  // Refs avoid stale closures inside the async scan loop
  const abortedRef = React.useRef(false);
  const runningRef = React.useRef(false);

  const startScan = React.useCallback(
    async ({ domains, siteMap, label }: StartScanArgs) => {
      if (runningRef.current || domains.length === 0) return;
      runningRef.current = true;
      abortedRef.current = false;

      // Create a server-side session — best-effort, scan proceeds regardless
      let sessionId: number | null = null;
      try {
        const session = await api.createScanSession(domains.length, label);
        sessionId = session.id;
      } catch {
        // Session creation failed — scan continues untracked server-side
      }

      setScan({
        running: true,
        sessionId,
        label: label ?? '',
        total: domains.length,
        done: 0,
        failed: 0,
        current: [],
        errors: [],
      });

      // Dynamic imports so the orchestrator bundle isn't loaded until needed
      const { scanSite } = await import('../scanner/orchestrator');
      const { computeDiff } = await import('../lib/diff');

      // Local counters avoid React-state closure issues when writing to the DB
      let localDone = 0;
      let localFailed = 0;

      await pLimit(
        domains,
        CONCURRENCY,
        async (domain) => {
          if (abortedRef.current) return;
          setScan((p) => ({ ...p, current: [...p.current, domain] }));

          try {
            const site: Record<string, unknown> = siteMap?.[domain] ?? {};
            const url = String(site.url ?? `https://${domain}`);
            const result = await scanSite(url);
            if (abortedRef.current) return;

            // Build scan-field snapshot for diff
            const scanFields: Record<string, unknown> = {};
            if (result.tech_stack) {
              const ts = result.tech_stack;
              Object.assign(scanFields, {
                cms: ts.cms,
                web_server: ts.web_server,
                cdn_provider: ts.cdn,
                hosting_provider: ts.hosting_provider,
                https_enforced: ts.https_enforced,
                hsts: ts.hsts,
              });
              if (ts.dap) {
                Object.assign(scanFields, {
                  dap: ts.dap.detected,
                  ga_tag_id: ts.dap.ga_tag_id,
                });
              }
              if (ts.wordpress) {
                Object.assign(scanFields, {
                  wp_version: ts.wordpress.version,
                  wp_theme: ts.wordpress.theme,
                });
              }
            }
            if (result.sitemap) Object.assign(scanFields, { sitemap_xml_detected: result.sitemap.detected });
            if (result.robots)  Object.assign(scanFields, { robots_txt_detected: result.robots.detected });
            if (result.dns)     Object.assign(scanFields, { ipv6: result.dns.ipv6 });

            // Build "before" snapshot from whatever we already have for this domain
            const before: Record<string, unknown> = {};
            for (const key of Object.keys(scanFields)) before[key] = site[key];
            const diff = computeDiff(before, scanFields);

            await api.postScan(domain, result, diff);

            localDone++;
            setScan((p) => ({
              ...p,
              done: p.done + 1,
              current: p.current.filter((d) => d !== domain),
            }));
          } catch (e: any) {
            localFailed++;
            setScan((p) => ({
              ...p,
              failed: p.failed + 1,
              current: p.current.filter((d) => d !== domain),
              errors: [...p.errors, { domain, message: String(e?.message ?? e) }],
            }));
          }

          // Persist progress to DB every 5 completions so the record stays fresh
          // even if the user closes the tab mid-scan
          const completedSoFar = localDone + localFailed;
          if (sessionId && completedSoFar % 5 === 0) {
            api.updateScanSession(sessionId, {
              completed_count: localDone,
              failed_count: localFailed,
            }).catch(() => {});
          }
        },
        () => abortedRef.current,
      );

      const finalStatus = abortedRef.current ? 'stopped' : 'completed';
      setScan((p) => ({ ...p, running: false, current: [] }));
      runningRef.current = false;

      // Finalise the server-side session record
      if (sessionId) {
        api.updateScanSession(sessionId, {
          status: finalStatus,
          completed_count: localDone,
          failed_count: localFailed,
        }).catch(() => {});
      }

      // Refresh data tables
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['scan-sessions'] });
    },
    [qc],
  );

  const stopScan = React.useCallback(() => {
    abortedRef.current = true;
  }, []);

  return (
    <ScanQueueContext.Provider value={{ scan, startScan, stopScan }}>
      {children}
    </ScanQueueContext.Provider>
  );
}
