/**
 * ReportHeader — shown at the top of DashboardView when a reportConfig is active.
 * Displays scope label, domain count, created-at, and action buttons.
 */
import React from 'react';
import { useUIStore } from '../../store/uiStore';
import type { StatsResponse } from 'shared';

interface Props {
  stats: StatsResponse | undefined;
  onClear: () => void;
  onExportJSON: () => void;
  onExportPPT?: () => void;
}

export default function ReportHeader({ stats, onClear, onExportJSON, onExportPPT }: Props) {
  const { reportConfig } = useUIStore();
  const [copied, setCopied] = React.useState(false);

  if (!reportConfig) return null;

  const scopeLabel = (() => {
    if (reportConfig.label) return reportConfig.label;
    if (reportConfig.scope === 'agency') {
      return [reportConfig.agency, reportConfig.bureaus?.join(', ')].filter(Boolean).join(' › ');
    }
    if (reportConfig.scope === 'sql') return 'SQL query results';
    return 'Selected sites';
  })();

  const domainCount = stats?.total_sites ?? reportConfig.domains?.length ?? '—';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="flex items-start justify-between gap-4 px-8 py-5 border-b border-gray-200 bg-white print:border-b-2 print:border-gray-800">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <span className="uppercase tracking-wide font-medium">Dashboard Report</span>
          <span>·</span>
          <span className="capitalize">{reportConfig.scope} scope</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 truncate">{scopeLabel}</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {domainCount} site{domainCount !== 1 ? 's' : ''}
          {reportConfig.createdAt && (
            <> · Generated {new Date(reportConfig.createdAt).toLocaleString()}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 print:hidden">
        <button
          onClick={handleCopyLink}
          className="btn-secondary text-xs py-1 px-2"
          title="Copy shareable link to clipboard"
        >
          {copied ? '✓ Copied' : '🔗 Share'}
        </button>
        <button onClick={onExportJSON} className="btn-secondary text-xs py-1 px-2">
          JSON ↓
        </button>
        {onExportPPT && (
          <button onClick={onExportPPT} className="btn-secondary text-xs py-1 px-2" title="Download as PowerPoint">
            PPT ↓
          </button>
        )}
        <button onClick={() => window.print()} className="btn-secondary text-xs py-1 px-2">
          Print / PDF
        </button>
        <button onClick={onClear} className="btn-secondary text-xs py-1 px-2">
          Clear
        </button>
      </div>
    </div>
  );
}
