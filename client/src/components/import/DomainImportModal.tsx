import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

// ---------------------------------------------------------------------------
// Domain parsing
// ---------------------------------------------------------------------------

function parseDomains(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim().toLowerCase())
        .map((s) => s.replace(/^https?:\/\//i, '')) // strip protocol
        .map((s) => s.split('/')[0])                 // strip path
        .map((s) => s.split('?')[0])                 // strip query string
        .map((s) => s.split('#')[0])                 // strip fragment
        .filter((s) => s.length > 0 && s.includes('.')), // basic validity check
    ),
  ];
}

// ---------------------------------------------------------------------------
// Concurrency helper (same pattern as ExplorerView bulk scan)
// ---------------------------------------------------------------------------

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

const CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanProgress {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  current: string[];
  errors: { domain: string; message: string }[];
}

const INITIAL_PROGRESS: ScanProgress = {
  running: false,
  total: 0,
  done: 0,
  failed: 0,
  current: [],
  errors: [],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DomainImportModal({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [raw, setRaw] = React.useState('');
  const [progress, setProgress] = React.useState<ScanProgress>(INITIAL_PROGRESS);
  const abortedRef = React.useRef(false);

  // Reset state each time the modal opens
  React.useEffect(() => {
    if (open) {
      setRaw('');
      setProgress(INITIAL_PROGRESS);
    }
  }, [open]);

  const domains = parseDomains(raw);
  const isDone = !progress.running && progress.total > 0;

  // Accept .txt (and .csv) drops onto the textarea area
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/plain': ['.txt', '.csv'] },
    noClick: true,
    onDrop: async (files) => {
      const file = files[0];
      if (!file) return;
      const text = await file.text();
      setRaw((prev) => (prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim()));
    },
  });

  // ---------------------------------------------------------------------------
  // Scan logic
  // ---------------------------------------------------------------------------

  const handleStart = async () => {
    if (progress.running || domains.length === 0) return;
    abortedRef.current = false;
    setProgress({ ...INITIAL_PROGRESS, running: true, total: domains.length });

    const { scanSite } = await import('../../scanner/orchestrator');
    const { computeDiff } = await import('../../lib/diff');

    await pLimit(
      domains,
      CONCURRENCY,
      async (domain) => {
        if (abortedRef.current) return;
        setProgress((p) => ({ ...p, current: [...p.current, domain] }));

        try {
          const result = await scanSite(`https://${domain}`);
          if (abortedRef.current) return;

          // Build a minimal scan fields snapshot for the diff
          // (no prior site record exists, so "before" is empty)
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
            if (ts.dap) Object.assign(scanFields, { dap: ts.dap.detected, ga_tag_id: ts.dap.ga_tag_id });
          }
          if (result.sitemap) Object.assign(scanFields, { sitemap_xml_detected: result.sitemap.detected });
          if (result.robots)  Object.assign(scanFields, { robots_txt_detected: result.robots.detected });
          if (result.dns)     Object.assign(scanFields, { ipv6: result.dns.ipv6 });

          const diff = computeDiff({}, scanFields);
          await api.postScan(domain, result, diff);

          setProgress((p) => ({
            ...p,
            done: p.done + 1,
            current: p.current.filter((d) => d !== domain),
          }));
        } catch (e: any) {
          setProgress((p) => ({
            ...p,
            failed: p.failed + 1,
            current: p.current.filter((d) => d !== domain),
            errors: [...p.errors, { domain, message: e.message }],
          }));
        }
      },
      () => abortedRef.current,
    );

    setProgress((p) => ({ ...p, running: false, current: [] }));
    qc.invalidateQueries({ queryKey: ['sites'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const handleStop = () => {
    abortedRef.current = true;
  };

  const handleClose = () => {
    if (progress.running) return; // block close while scanning
    onOpenChange(false);
  };

  const handleClear = () => {
    setRaw('');
    setProgress(INITIAL_PROGRESS);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const completedCount = progress.done + progress.failed;
  const pct = progress.total ? (completedCount / progress.total) * 100 : 0;

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-40" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] max-h-[85vh] bg-white rounded-xl shadow-2xl z-50 flex flex-col focus:outline-none"
          aria-describedby="domain-import-description"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <Dialog.Title className="text-sm font-semibold text-gray-800">
              Add domains
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close dialog"
                className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-40"
                disabled={progress.running}
              >
                <span aria-hidden="true">×</span>
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <p id="domain-import-description" className="text-xs text-gray-500">
              Enter domains one per line or comma-separated. Each domain will be scanned and added
              to the corpus. You can also drag and drop a <code className="font-mono">.txt</code> file.
            </p>

            {/* Textarea with drag-and-drop overlay */}
            <div>
              <div
                {...getRootProps()}
                className={`relative rounded-lg border-2 transition-colors ${
                  isDragActive
                    ? 'border-gov-blue bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input {...getInputProps()} />
                <label htmlFor="domain-import-textarea" className="sr-only">Domains to import (one per line or comma-separated)</label>
                <textarea
                  id="domain-import-textarea"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  disabled={progress.running}
                  rows={8}
                  aria-describedby="domain-import-description"
                  placeholder={'ct.gov\nkansas.gov\nhhs.gov, va.gov'}
                  className="w-full p-3 text-xs font-mono bg-transparent resize-none focus:outline-none disabled:opacity-50 rounded-lg"
                />
                {isDragActive && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg pointer-events-none">
                    <span className="text-sm font-medium text-gov-blue bg-white/90 px-3 py-1.5 rounded-lg shadow">
                      Drop .txt file to load domains
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-1.5">
                <p className="text-xs text-gray-400">
                  {domains.length > 0
                    ? `${domains.length} domain${domains.length === 1 ? '' : 's'} ready`
                    : 'Or drag and drop a .txt file'}
                </p>
                {raw && !progress.running && (
                  <button
                    onClick={handleClear}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Scan progress */}
            {(progress.running || isDone) && (
              <div role="status" aria-live="polite" aria-atomic="false" className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">
                    {progress.running ? 'Scanning…' : '✓ Complete'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {completedCount} / {progress.total}
                    {progress.failed > 0 && (
                      <span className="text-red-500 ml-1">({progress.failed} failed)</span>
                    )}
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={completedCount}
                  aria-label={`Scan progress: ${completedCount} of ${progress.total}`}
                  className="h-1.5 bg-gray-200 rounded-full overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isDone && progress.failed > 0 ? 'bg-yellow-400' : 'bg-gov-blue'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Currently scanning */}
                {progress.current.length > 0 && (
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {progress.current.join(', ')}
                  </p>
                )}

                {/* Error list */}
                {progress.errors.length > 0 && (
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-24 overflow-y-auto bg-red-50 rounded p-2 font-mono">
                    {progress.errors.map((e, i) => (
                      <li key={i}>
                        {e.domain}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
            {progress.running ? (
              <button
                onClick={handleStop}
                className="btn-secondary text-xs text-red-600 border-red-300"
              >
                ⏹ Stop
              </button>
            ) : (
              <>
                <Dialog.Close asChild>
                  <button className="btn-secondary text-xs">
                    {isDone ? 'Close' : 'Cancel'}
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleStart}
                  disabled={domains.length === 0}
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  Scan &amp; import{' '}
                  {domains.length > 0
                    ? `${domains.length} domain${domains.length === 1 ? '' : 's'}`
                    : ''}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
