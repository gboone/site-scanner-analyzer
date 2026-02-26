import React, { useState, useEffect } from 'react';
import Shell from './components/layout/Shell';
import ExplorerView from './views/ExplorerView';
import SqlView from './views/SqlView';
import DashboardView from './views/DashboardView';
import SettingsView from './views/SettingsView';
import ErrorBoundary from './components/ErrorBoundary';
import { useUIStore } from './store/uiStore';

export type View = 'explorer' | 'sql' | 'dashboard' | 'settings';

// Custom event used to focus the Explorer search input via Cmd+K
export const FOCUS_SEARCH_EVENT = 'site-scanner:focus-search';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('explorer');
  const { closeDetail } = useUIStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+K / Ctrl+K → Explorer + focus search
      if (mod && e.key === 'k') {
        e.preventDefault();
        setCurrentView('explorer');
        // Small delay so the view renders before we try to focus
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
    <Shell currentView={currentView} onNavigate={setCurrentView}>
      <ErrorBoundary key={currentView} label={currentView}>
        {currentView === 'explorer' && <ExplorerView />}
        {currentView === 'sql' && <SqlView />}
        {currentView === 'dashboard' && <DashboardView />}
        {currentView === 'settings' && <SettingsView />}
      </ErrorBoundary>
    </Shell>
  );
}
