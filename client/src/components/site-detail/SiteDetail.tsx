import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useSite } from '../../hooks/useSites';
import SiteFields from './SiteFields';
import ScanHistory from './ScanHistory';
import ResearchPanel from '../briefings/ResearchPanel';

export default function SiteDetail() {
  const { selectedDomain, detailPanelOpen, closeDetail, activeTab, setActiveTab } = useUIStore();
  const { data, isLoading } = useSite(selectedDomain);

  if (!detailPanelOpen || !selectedDomain) return null;

  const site = data?.site;
  const scanHistory = data?.scan_history || [];
  const briefings = data?.briefings || [];

  return (
    <div className="absolute inset-y-0 right-0 w-[480px] bg-white border-l border-gray-200 shadow-2xl flex flex-col z-20">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="min-w-0">
          <div className="font-mono font-semibold text-sm text-gov-blue truncate">{selectedDomain}</div>
          {site && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {site.agency} {site.bureau ? `· ${String(site.bureau).split(' - ').pop()}` : ''}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
          {site?.url && (
            <a
              href={String(site.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gov-blue hover:underline"
            >
              Open ↗
            </a>
          )}
          <button
            onClick={closeDetail}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['overview', 'scans', 'research'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-gov-blue border-b-2 border-gov-blue'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            {tab === 'scans' && scanHistory.length > 0 && (
              <span className="ml-1 badge badge-gray">{scanHistory.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">Loading…</div>
        ) : !site ? (
          <div className="p-4 text-sm text-gray-500">Site data not found.</div>
        ) : (
          <>
            {activeTab === 'overview' && <SiteFields site={site} domain={selectedDomain} />}
            {activeTab === 'scans' && <ScanHistory history={scanHistory} domain={selectedDomain} site={site} />}
            {activeTab === 'research' && <ResearchPanel domain={selectedDomain} briefings={briefings} />}
          </>
        )}
      </div>
    </div>
  );
}
