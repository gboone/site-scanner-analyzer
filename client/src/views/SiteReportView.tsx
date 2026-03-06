import React from 'react';
import { useUIStore } from '../store/uiStore';
import { useSite } from '../hooks/useSites';
import type { View } from '../App';
import SiteFields from '../components/site-detail/SiteFields';
import ScanHistory from '../components/site-detail/ScanHistory';

interface Props {
  onNavigate: (view: View) => void;
}

function StatTile({ label, value, sub, good }: { label: string; value: string | number; sub?: string; good?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${good === true ? 'text-green-600' : good === false ? 'text-red-500' : 'text-gray-800'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

export default function SiteReportView({ onNavigate }: Props) {
  const { selectedDomain, openDetail } = useUIStore();
  const domain = selectedDomain;
  const { data, isLoading } = useSite(domain);

  const handleExportJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-report-${domain}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!domain) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <span className="text-4xl">🔍</span>
        <p>No site selected. Open a site from the Explorer first.</p>
        <button onClick={() => onNavigate('explorer')} className="btn-secondary text-sm">
          ← Back to Explorer
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>;
  }

  if (!data?.site) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <p>Site not found: {domain}</p>
        <button onClick={() => onNavigate('explorer')} className="btn-secondary text-sm">← Back</button>
      </div>
    );
  }

  const site = data.site as Record<string, unknown>;
  const scans = (data.scan_history ?? []) as any[];
  const redirectSources = ((data as any).redirect_sources ?? []) as string[];

  const bool = (v: unknown) => v === 1 || v === true || v === '1';

  // Derive the final hostname for redirect display
  const redirectTargetHost = (() => {
    if (!bool(site.redirect) || !site.url) return null;
    try { return new URL(String(site.url)).hostname; } catch { return null; }
  })();

  return (
    <div className="flex flex-col h-full overflow-auto print:overflow-visible">
      {/* Report header */}
      <div className="flex items-start justify-between gap-4 px-8 py-5 border-b border-gray-200 bg-white print:border-b-2 print:border-gray-800 no-print-hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <button onClick={() => onNavigate('explorer')} className="hover:text-gray-800 print:hidden">
              ← Explorer
            </button>
            <span className="print:hidden">/</span>
            <span className="truncate">{String(site.agency ?? '')} {site.bureau ? `· ${String(site.bureau)}` : ''}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 font-mono">{domain}</h1>
          {!!site.title && <p className="text-gray-500 text-sm mt-0.5 truncate">{String(site.title)}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 print:hidden">
          <a
            href={`https://${domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs py-1 px-2"
          >
            Visit ↗
          </a>
          <button onClick={handleExportJSON} className="btn-secondary text-xs py-1 px-2">JSON ↓</button>
          <button onClick={() => window.print()} className="btn-primary text-xs py-1 px-2">Print / PDF</button>
        </div>
      </div>

      <div className="flex-1 px-8 py-6 space-y-8 max-w-5xl mx-auto w-full">

        {/* Redirect banner — shown when this domain redirects to another */}
        {redirectTargetHost && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <span className="text-amber-600 font-medium">↪ This domain redirects to:</span>
            <button
              onClick={() => openDetail(redirectTargetHost)}
              className="font-mono text-gov-blue hover:underline"
            >
              {redirectTargetHost}
            </button>
            {site.url ? (
              <a
                href={String(site.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 text-xs ml-1"
              >
                ↗
              </a>
            ) : null}
          </div>
        )}

        {/* Redirect sources — shown when other domains redirect to this one */}
        {redirectSources.length > 0 && (
          <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <p className="text-blue-700 font-medium mb-2">
              {redirectSources.length} domain{redirectSources.length !== 1 ? 's' : ''} redirect to this domain:
            </p>
            <div className="flex flex-wrap gap-2">
              {redirectSources.map((src) => (
                <button
                  key={src}
                  onClick={() => openDetail(src)}
                  className="font-mono text-xs text-gov-blue bg-white border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-100 transition-colors"
                >
                  {src}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Key metric tiles */}
        <section aria-label="Key metrics">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Metrics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile label="Live" value={bool(site.live) ? 'Yes' : 'No'} good={bool(site.live)} />
            <StatTile label="HTTPS" value={bool(site.https_enforced) ? 'Enforced' : 'No'} good={bool(site.https_enforced)} />
            <StatTile label="HSTS" value={bool(site.hsts) ? 'Yes' : 'No'} good={bool(site.hsts)} />
            <StatTile label="USWDS" value={site.uswds_count != null ? String(site.uswds_count) : '—'} />
            <StatTile label="DAP" value={bool(site.dap) ? 'Yes' : 'No'} good={bool(site.dap)} />
            <StatTile label="Sitemap" value={bool(site.sitemap_xml_detected) ? 'Yes' : 'No'} good={bool(site.sitemap_xml_detected)} />
          </div>
        </section>

        {/* All detail sections (reuse the same data groups as the sidebar) */}
        <section aria-label="Full site details">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">All Fields</h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <SiteFields site={site} domain={domain} />
          </div>
        </section>

        {/* Scan history */}
        {scans.length > 0 && (
          <section aria-label="Scan history">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Scan History ({scans.length})</h2>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <ScanHistory domain={domain} history={scans} site={site} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
