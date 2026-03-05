import { create } from 'zustand';

export interface ReportConfig {
  scope: 'selection' | 'agency' | 'sql';
  domains?: string[];
  agency?: string;
  bureaus?: string[];
  sqlQuery?: string;
  label?: string;
  createdAt: string;
}

interface UIStore {
  selectedDomain: string | null;
  detailPanelOpen: boolean;
  activeTab: 'overview' | 'scans' | 'research';
  activeFilters: Record<string, string | boolean>;
  reportConfig: ReportConfig | null;

  selectDomain: (domain: string | null) => void;
  openDetail: (domain: string) => void;
  closeDetail: () => void;
  setActiveTab: (tab: 'overview' | 'scans' | 'research') => void;
  setFilter: (key: string, value: string | boolean | null) => void;
  clearFilters: () => void;
  setReport: (config: ReportConfig) => void;
  clearReport: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedDomain: null,
  detailPanelOpen: false,
  activeTab: 'overview',
  activeFilters: {},
  reportConfig: null,

  selectDomain: (domain) => set({ selectedDomain: domain }),
  openDetail: (domain) => set({ selectedDomain: domain, detailPanelOpen: true, activeTab: 'overview' }),
  closeDetail: () => set({ detailPanelOpen: false, selectedDomain: null }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setFilter: (key, value) =>
    set((s) => ({
      activeFilters: value === null
        ? Object.fromEntries(Object.entries(s.activeFilters).filter(([k]) => k !== key))
        : { ...s.activeFilters, [key]: value },
    })),
  clearFilters: () => set({ activeFilters: {} }),
  setReport: (config) => set({ reportConfig: config }),
  clearReport: () => set({ reportConfig: null }),
}));
