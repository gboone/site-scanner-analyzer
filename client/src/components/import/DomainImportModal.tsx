import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useDropzone } from 'react-dropzone';
import { useScanQueue } from '../../contexts/ScanQueueContext';

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
// Types
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DomainImportModal({ open, onOpenChange }: Props) {
  const { scan, startScan, stopScan } = useScanQueue();
  const [raw, setRaw] = React.useState('');
  // Track whether this modal instance initiated the current (or last) scan,
  // so we show the progress block only for scans started here.
  const scanInitiatedRef = React.useRef(false);

  // Reset raw text when modal opens. Only reset the "I started this scan" flag
  // if no scan is currently running (so re-opening mid-scan still shows progress).
  React.useEffect(() => {
    if (open) {
      setRaw('');
      if (!scan.running) {
        scanInitiatedRef.current = false;
      }
    }
  }, [open, scan.running]);

  const domains = parseDomains(raw);
  const isDone = scanInitiatedRef.current && !scan.running && scan.total > 0;

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
  // Scan logic — delegates to ScanQueueContext so scan persists across navigation
  // ---------------------------------------------------------------------------

  const handleStart = () => {
    if (scan.running || domains.length === 0) return;
    scanInitiatedRef.current = true;
    // No siteMap for new domains — context will default to https://{domain}
    // and diff against an empty baseline.
    startScan({ domains, label: 'Scan & import' });
  };

  const handleStop = () => stopScan();

  // Allow closing the modal while scanning — scan continues in the Shell indicator.
  const handleClose = () => onOpenChange(false);

  const handleClear = () => {
    setRaw('');
    scanInitiatedRef.current = false;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showProgress = (scan.running && scanInitiatedRef.current) || isDone;
  const completedCount = scan.done + scan.failed;
  const pct = scan.total ? (completedCount / scan.total) * 100 : 0;

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
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
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
                  disabled={scan.running}
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
                {raw && !scan.running && (
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
            {showProgress && (
              <div role="status" aria-live="polite" aria-atomic="false" className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">
                    {scan.running ? 'Scanning…' : '✓ Complete'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {completedCount} / {scan.total}
                    {scan.failed > 0 && (
                      <span className="text-red-500 ml-1">({scan.failed} failed)</span>
                    )}
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={scan.total}
                  aria-valuenow={completedCount}
                  aria-label={`Scan progress: ${completedCount} of ${scan.total}`}
                  className="h-1.5 bg-gray-200 rounded-full overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isDone && scan.failed > 0 ? 'bg-yellow-400' : 'bg-gov-blue'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Currently scanning */}
                {scan.current.length > 0 && (
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {scan.current.join(', ')}
                  </p>
                )}

                {/* "scan continues in background" hint */}
                {scan.running && (
                  <p className="text-xs text-blue-600">
                    You can close this dialog — the scan will continue in the background.
                  </p>
                )}

                {/* Error list */}
                {scan.errors.length > 0 && (
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-24 overflow-y-auto bg-red-50 rounded p-2 font-mono">
                    {scan.errors.map((e, i) => (
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
            {scan.running ? (
              <>
                <Dialog.Close asChild>
                  <button className="btn-secondary text-xs">
                    Close (scan continues)
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleStop}
                  className="btn-secondary text-xs text-red-600 border-red-300"
                >
                  <span aria-hidden="true">⏹ </span>Stop scan
                </button>
              </>
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
