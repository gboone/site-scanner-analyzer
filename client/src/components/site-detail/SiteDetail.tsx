import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { useSite } from '../../hooks/useSites';
import SiteFields from './SiteFields';
import ScanHistory from './ScanHistory';
import ResearchPanel from '../briefings/ResearchPanel';

const FOCUS_SELECTORS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Trap keyboard focus within a container element while it is active. */
function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  React.useEffect(() => {
    if (!active || !ref.current) return;
    const panel = ref.current;

    // Move focus into the panel on open
    const firstFocusable = panel.querySelector<HTMLElement>(FOCUS_SELECTORS);
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUS_SELECTORS));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', handleKeyDown);
    return () => panel.removeEventListener('keydown', handleKeyDown);
  }, [active, ref]);
}

const TABS = ['overview', 'scans', 'research'] as const;
type TabId = typeof TABS[number];

export default function SiteDetail() {
  const { selectedDomain, detailPanelOpen, closeDetail, activeTab, setActiveTab } = useUIStore();
  const { data, isLoading } = useSite(selectedDomain);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = 'site-detail-title';

  useFocusTrap(panelRef, detailPanelOpen);

  // Close on Escape
  React.useEffect(() => {
    if (!detailPanelOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [detailPanelOpen, closeDetail]);

  if (!detailPanelOpen || !selectedDomain) return null;

  const site = data?.site;
  const scanHistory = data?.scan_history || [];
  const briefings = data?.briefings || [];

  const tabPanelId = (tab: TabId) => `site-detail-panel-${tab}`;
  const tabButtonId = (tab: TabId) => `site-detail-tab-${tab}`;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute inset-y-0 right-0 w-[480px] bg-white border-l border-gray-200 shadow-2xl flex flex-col z-20"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="min-w-0">
          <div id={titleId} className="font-mono font-semibold text-sm text-gov-blue truncate">{selectedDomain}</div>
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
            aria-label="Close site detail panel"
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Site detail sections" className="flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            id={tabButtonId(tab)}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={tabPanelId(tab)}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-gov-blue border-b-2 border-gov-blue'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            {tab === 'scans' && scanHistory.length > 0 && (
              <span className="ml-1 badge badge-gray" aria-label={`${scanHistory.length} scans`}>{scanHistory.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400" aria-live="polite" aria-busy="true">Loading…</div>
        ) : !site ? (
          <div className="p-4 text-sm text-gray-500">Site data not found.</div>
        ) : (
          <>
            {TABS.map((tab) => (
              <div
                key={tab}
                id={tabPanelId(tab)}
                role="tabpanel"
                aria-labelledby={tabButtonId(tab)}
                hidden={activeTab !== tab}
              >
                {tab === 'overview' && activeTab === 'overview' && <SiteFields site={site} domain={selectedDomain} />}
                {tab === 'scans' && activeTab === 'scans' && <ScanHistory history={scanHistory} domain={selectedDomain} site={site} />}
                {tab === 'research' && activeTab === 'research' && <ResearchPanel domain={selectedDomain} briefings={briefings} />}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
