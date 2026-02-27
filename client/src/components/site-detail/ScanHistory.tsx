import React from 'react';

interface ScanHistoryProps {
  history: any[];
  domain: string;
  site: Record<string, unknown>;
}

export default function ScanHistory({ history, domain }: ScanHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        <div className="text-3xl mb-3">📋</div>
        <p>No re-scans yet.</p>
        <p className="text-xs mt-1">Use the Overview tab to run a re-scan.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {history.map((scan: any) => {
        const diff = scan.diff_summary ? JSON.parse(scan.diff_summary) : null;
        const errors = scan.error_log ? JSON.parse(scan.error_log) : [];
        return (
          <div key={scan.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">
                {new Date(scan.scanned_at).toLocaleString()}
              </span>
              <div className="flex items-center gap-1.5">
                {scan.status === 'completed' ? (
                  <span className="badge badge-green">completed</span>
                ) : scan.status === 'failed' ? (
                  <span className="badge badge-red">failed</span>
                ) : (
                  <span className="badge badge-yellow">partial</span>
                )}
                {scan.duration_ms && (
                  <span className="text-xs text-gray-400">{scan.duration_ms}ms</span>
                )}
              </div>
            </div>

            {diff && diff.changed.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium text-gray-600 mb-1">
                  {diff.changed.length} field{diff.changed.length !== 1 ? 's' : ''} changed
                </div>
                <div className="space-y-1">
                  {diff.changed.slice(0, 5).map((f: any) => (
                    <div key={f.field} className="text-xs font-mono bg-gray-50 rounded px-2 py-1">
                      <span className="text-gray-500">{f.field}:</span>{' '}
                      <span className="text-red-500 line-through">{JSON.stringify(f.before)}</span>{' '}
                      → <span className="text-green-600">{JSON.stringify(f.after)}</span>
                    </div>
                  ))}
                  {diff.changed.length > 5 && (
                    <div className="text-xs text-gray-400">+{diff.changed.length - 5} more changes</div>
                  )}
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">
                {errors.join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
