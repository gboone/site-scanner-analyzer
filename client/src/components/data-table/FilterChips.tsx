import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { FOCUS_SEARCH_EVENT } from '../../App';

const CHIPS = [
  { key: 'live', value: 'true', label: 'Live', color: 'green' },
  { key: 'has_uswds', value: 'true', label: 'Has USWDS', color: 'blue' },
  { key: 'no_sitemap', value: 'true', label: 'No Sitemap', color: 'yellow' },
  { key: 'has_dap', value: 'true', label: 'Has DAP', color: 'blue' },
  { key: 'https_enforced', value: 'true', label: 'HTTPS ✓', color: 'green' },
  { key: 'has_login', value: 'true', label: 'Has Login', color: 'gray' },
];

const COLOR_MAP: Record<string, { active: string; inactive: string }> = {
  green: { active: 'bg-green-600 text-white border-green-600', inactive: 'bg-white text-green-700 border-green-300 hover:bg-green-50' },
  blue: { active: 'bg-gov-blue text-white border-gov-blue', inactive: 'bg-white text-gov-blue border-blue-300 hover:bg-blue-50' },
  yellow: { active: 'bg-yellow-500 text-white border-yellow-500', inactive: 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50' },
  gray: { active: 'bg-gray-600 text-white border-gray-600', inactive: 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50' },
};

interface FilterChipsProps {
  onFilter: (filters: Record<string, string>) => void;
}

export default function FilterChips({ onFilter }: FilterChipsProps) {
  const { activeFilters, setFilter, clearFilters } = useUIStore();
  const [search, setSearch] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Focus the search input when Cmd+K fires from App.tsx
  React.useEffect(() => {
    function handler() {
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, handler);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, handler);
  }, []);

  const handleChip = (key: string, value: string) => {
    const current = activeFilters[key];
    if (current === value) {
      setFilter(key, null);
    } else {
      setFilter(key, value);
    }
  };

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(activeFilters)) {
        f[k] = String(v);
      }
      if (search) f.search = search;
      onFilter(f);
    }, 200);
    return () => clearTimeout(timeout);
  }, [activeFilters, search, onFilter]);

  const hasFilters = Object.keys(activeFilters).length > 0 || search;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2 px-4 bg-white border-b border-gray-200">
      <input
        ref={searchRef}
        type="text"
        placeholder="Search domain, agency, bureau… (⌘K)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border border-gray-300 rounded px-2.5 py-1 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-gov-blue"
      />

      <div className="h-4 w-px bg-gray-200" />

      {CHIPS.map((chip) => {
        const isActive = activeFilters[chip.key] === chip.value;
        const colors = COLOR_MAP[chip.color];
        return (
          <button
            key={chip.key}
            onClick={() => handleChip(chip.key, chip.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
              isActive ? colors.active : colors.inactive
            }`}
          >
            {chip.label}
          </button>
        );
      })}

      {hasFilters && (
        <button
          onClick={() => { clearFilters(); setSearch(''); }}
          className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
