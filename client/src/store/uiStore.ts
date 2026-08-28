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

/** A snapshot of the Explore view handed to the Chat view as starting context. */
export interface ExploreChatContext {
  description: string;                          // human-readable filter summary
  filters: Record<string, string | boolean>;   // params behind the view (→ list_sites)
  total: number;                                // total rows matching the filter
  sample: Array<Record<string, unknown>>;       // up to 100 rows, key fields only
  createdAt: string;
}

interface UIStore {
  selectedDomain: string | null;
  detailPanelOpen: boolean;
  activeTab: 'overview' | 'scans' | 'research';
  activeFilters: Record<string, string | boolean>;
  reportConfig: ReportConfig | null;
  chatContext: ExploreChatContext | null;

  selectDomain: (domain: string | null) => void;
  openDetail: (domain: string) => void;
  closeDetail: () => void;
  setActiveTab: (tab: 'overview' | 'scans' | 'research') => void;
  setFilter: (key: string, value: string | boolean | null) => void;
  clearFilters: () => void;
  setReport: (config: ReportConfig) => void;
  clearReport: () => void;
  setChatContext: (context: ExploreChatContext) => void;
  clearChatContext: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedDomain: null,
  detailPanelOpen: false,
  activeTab: 'overview',
  activeFilters: {},
  reportConfig: null,
  chatContext: null,

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
  setChatContext: (context) => set({ chatContext: context }),
  clearChatContext: () => set({ chatContext: null }),
}));
