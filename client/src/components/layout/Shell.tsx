import React from 'react';
import type { View } from '../../App';
import { useScanQueue } from '../../contexts/ScanQueueContext';

interface ShellProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onCopyLink: () => Promise<boolean>;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: View; label: string; icon: string }> = [
  { id: 'explorer', label: 'Explorer', icon: '🔍' },
  { id: 'sql', label: 'SQL Query', icon: '💾' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Shell({ currentView, onNavigate, onCopyLink, children }: ShellProps) {
  const [copied, setCopied] = React.useState(false);
  const { scan, stopScan } = useScanQueue();

  const handleCopyLink = React.useCallback(async () => {
    const ok = await onCopyLink();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [onCopyLink]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Skip navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-gov-blue focus:font-medium focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-gov-blue"
      >
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 bg-gov-blue-dark text-white flex flex-col" aria-label="Main navigation">
        <div className="p-4 border-b border-white/20 flex items-start justify-between gap-1">
          <div>
            <div className="font-bold text-sm leading-tight">GSA Site Scanner</div>
            <div className="text-white/60 text-xs">Analyzer</div>
          </div>
          <button
            onClick={handleCopyLink}
            title={copied ? 'Copied!' : 'Copy shareable link'}
            aria-label={copied ? 'Link copied' : 'Copy shareable link'}
            className="flex-shrink-0 text-white/40 hover:text-white/80 text-base mt-0.5 transition-colors"
          >
            {copied ? '✓' : '🔗'}
          </button>
        </div>
        <nav className="flex-1 py-2" aria-label="Views">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={currentView === item.id ? 'page' : undefined}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                currentView === item.id
                  ? 'bg-white/20 text-white font-medium'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {/* Sidebar footer — scan progress when running */}
        {scan.running && (
          <div className="p-3 border-t border-white/20 space-y-1.5" role="status" aria-live="polite" aria-atomic="false">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-white/80 font-medium truncate">
                {scan.label || 'Scanning…'}
              </span>
              <button
                onClick={stopScan}
                className="flex-shrink-0 text-white/50 hover:text-white text-xs"
                title="Stop scan"
                aria-label="Stop scan"
              >
                ⏹
              </button>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={scan.total}
              aria-valuenow={scan.done + scan.failed}
              aria-label={`${scan.done + scan.failed} of ${scan.total} scanned`}
              className="h-1 bg-white/20 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-white/60 rounded-full transition-all duration-300"
                style={{ width: scan.total ? `${((scan.done + scan.failed) / scan.total) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-xs text-white/50 leading-tight">
              {scan.done + scan.failed} / {scan.total}
              {scan.failed > 0 && <span className="text-red-300 ml-1">({scan.failed} failed)</span>}
              {scan.current.length > 0 && (
                <span className="block font-mono truncate mt-0.5">
                  {scan.current[0]}{scan.current.length > 1 ? ` +${scan.current.length - 1}` : ''}
                </span>
              )}
            </p>
          </div>
        )}
      </aside>

      {/* Main */}
      <main id="main-content" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
