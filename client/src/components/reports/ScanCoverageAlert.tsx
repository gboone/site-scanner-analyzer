/**
 * ScanCoverageAlert — shows a warning banner when a meaningful proportion of
 * sites in the current report scope have never been scanned or have stale data.
 */
import React from 'react';
import type { StatsResponse } from 'shared';

interface Props {
  stats: StatsResponse;
}

export default function ScanCoverageAlert({ stats }: Props) {
  const { scan_coverage, total_sites } = stats;
  if (!scan_coverage || !total_sites) return null;

  const { never_scanned_count, stale_count } = scan_coverage;
  const neverPct = Math.round((never_scanned_count / total_sites) * 100);
  const stalePct  = Math.round((stale_count  / total_sites) * 100);

  // Only show if more than 10% are missing or stale
  if (neverPct < 10 && stalePct < 10) return null;

  return (
    <div role="alert" className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 print:border print:border-amber-300">
      <span className="text-xl leading-tight" aria-hidden="true">⚠️</span>
      <div className="space-y-0.5">
        <strong className="font-semibold">Scan coverage gaps detected</strong>
        <div className="text-xs text-amber-700 space-y-0.5">
          {neverPct >= 10 && (
            <p>
              <strong>{never_scanned_count.toLocaleString()}</strong> site{never_scanned_count !== 1 ? 's' : ''} ({neverPct}%) have{' '}
              <strong>never been scanned</strong>. Some metrics may undercount adoption.
            </p>
          )}
          {stalePct >= 10 && (
            <p>
              <strong>{stale_count.toLocaleString()}</strong> site{stale_count !== 1 ? 's' : ''} ({stalePct}%) have{' '}
              <strong>stale data</strong> (last scan &gt;90 days ago). Use the Explorer to queue a bulk rescan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
