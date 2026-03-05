import React, { useState, useEffect } from 'react';
import Shell from './components/layout/Shell';
import ExplorerView from './views/ExplorerView';
import SqlView from './views/SqlView';
import DashboardView from './views/DashboardView';
import SettingsView from './views/SettingsView';
import SiteReportView from './views/SiteReportView';
import MultiSiteReportView from './views/MultiSiteReportView';
import ErrorBoundary from './components/ErrorBoundary';
import { useUIStore } from './store/uiStore';
import { ScanQueueProvider } from './contexts/ScanQueueContext';
import { useUrlSync, decodeReport, encodeReport } from './hooks/useUrlSync';

export type View = 'explorer' | 'sql' | 'dashboard' | 'settings' | 'site-report' | 'multi-report';

// Custom event used to focus the Explorer search input via Cmd+K
export const FOCUS_SEARCH_EVENT = 'site-scanner:focus-search';

export default function App() {
  const { initialState, syncToUrl, copyLink } = useUrlSync();
  const { closeDetail, selectedDomain, detailPanelOpen, openDetail, reportConfig, setReport } = useUIStore();

  const [currentView, setCurrentView] = useState<View>((initialState.view as View) || 'explorer');

  // Restore state from URL hash on first mount
  useEffect(() => {
    if (initialState.domain) openDetail(initialState.domain);
    if (initialState.report) {
      const cfg = decodeReport(initialState.report);
      if (cfg) setReport(cfg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the hash in sync as view/domain/report changes
  useEffect(() => {
    syncToUrl({
      view: currentView,
      domain: detailPanelOpen && selectedDomain ? selectedDomain : undefined,
      report: reportConfig ? encodeReport(reportConfig) : undefined,
    });
  }, [currentView, selectedDomain, detailPanelOpen, reportConfig, syncToUrl]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+K / Ctrl+K → Explorer + focus search
      if (mod && e.key === 'k') {
        e.preventDefault();
        setCurrentView('explorer');
        setTimeout(() => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT)), 50);
      }

      // Cmd+/ / Ctrl+/ → SQL view
      if (mod && e.key === '/') {
        e.preventDefault();
        setCurrentView('sql');
      }

      // Escape → close site detail panel
      if (e.key === 'Escape') {
        closeDetail();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDetail]);

  return (
    <ScanQueueProvider>
      <Shell currentView={currentView} onNavigate={setCurrentView} onCopyLink={copyLink}>
        <ErrorBoundary key={currentView} label={currentView}>
          {currentView === 'explorer'    && <ExplorerView onNavigate={setCurrentView} />}
          {currentView === 'sql'         && <SqlView onNavigate={setCurrentView} />}
          {currentView === 'dashboard'   && <DashboardView onNavigate={setCurrentView} />}
          {currentView === 'settings'    && <SettingsView />}
          {currentView === 'site-report' && <SiteReportView onNavigate={setCurrentView} />}
          {currentView === 'multi-report' && <MultiSiteReportView onNavigate={setCurrentView} />}
        </ErrorBoundary>
      </Shell>
    </ScanQueueProvider>
  );
}
