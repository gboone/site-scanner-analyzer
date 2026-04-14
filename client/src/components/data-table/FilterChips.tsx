import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { FOCUS_SEARCH_EVENT } from '../../App';

interface Chip {
  key: string;
  value: string;
  label: string;
  negLabel?: string;
  color: string;
  noInverse?: boolean;
}

const CHIPS: Chip[] = [
  { key: 'live',           value: 'true', label: 'Live',          negLabel: 'Not Live',       color: 'green' },
  { key: 'public_only',   value: 'true', label: 'Public',                                     color: 'green', noInverse: true },
  { key: 'no_redirect',   value: 'true', label: 'Hide Redirects', negLabel: 'Redirects Only', color: 'gray'  },
  { key: 'has_uswds',     value: 'true', label: 'Has USWDS',      negLabel: 'No USWDS',       color: 'blue'  },
  { key: 'no_sitemap',    value: 'true', label: 'No Sitemap',     negLabel: 'Has Sitemap',     color: 'yellow'},
  { key: 'has_dap',       value: 'true', label: 'Has DAP',        negLabel: 'No DAP',         color: 'blue'  },
  { key: 'https_enforced',value: 'true', label: 'HTTPS ✓',        negLabel: 'No HTTPS',       color: 'green' },
  { key: 'has_login',     value: 'true', label: 'Has Login',      negLabel: 'No Login',       color: 'gray'  },
  { key: 'show_hidden',   value: 'true', label: 'My Hidden',                                  color: 'red',  noInverse: true },
];

const COLOR_MAP: Record<string, { active: string; inactive: string; negative: string }> = {
  green:  { active: 'bg-green-600 text-white border-green-600',    inactive: 'bg-white text-green-700 border-green-300 hover:bg-green-50',    negative: 'bg-red-50 text-red-600 border-red-400 border-dashed'   },
  blue:   { active: 'bg-gov-blue text-white border-gov-blue',      inactive: 'bg-white text-gov-blue border-blue-300 hover:bg-blue-50',        negative: 'bg-orange-50 text-orange-600 border-orange-400 border-dashed' },
  yellow: { active: 'bg-yellow-500 text-white border-yellow-500',  inactive: 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50',  negative: 'bg-teal-50 text-teal-600 border-teal-400 border-dashed'  },
  gray:   { active: 'bg-gray-600 text-white border-gray-600',      inactive: 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',        negative: 'bg-gray-50 text-gray-500 border-gray-400 border-dashed'  },
  red:    { active: 'bg-red-600 text-white border-red-600',        inactive: 'bg-white text-red-600 border-red-300 hover:bg-red-50',           negative: 'bg-red-50 text-red-600 border-red-400 border-dashed'    },
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

  const handleChip = (chip: Chip) => {
    const current = activeFilters[chip.key];
    if (chip.noInverse) {
      // Binary: toggle on/off
      setFilter(chip.key, current === chip.value ? null : chip.value);
      return;
    }
    // Tri-state: unset → 'true' → 'false' → unset
    if (!current) {
      setFilter(chip.key, 'true');
    } else if (current === 'true') {
      setFilter(chip.key, 'false');
    } else {
      setFilter(chip.key, null);
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
    <div className="flex items-center gap-2 flex-wrap py-2 px-4 bg-white border-b border-gray-200" role="search">
      <label htmlFor="site-search" className="sr-only">Search domain, agency, or bureau</label>
      <input
        id="site-search"
        ref={searchRef}
        type="search"
        placeholder="Search domain, agency, bureau… (⌘K)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border border-gray-300 rounded px-2.5 py-1 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-gov-blue"
      />

      <div className="h-4 w-px bg-gray-200" role="separator" aria-hidden="true" />

      <div role="group" aria-label="Quick filters">
        {CHIPS.map((chip) => {
          const val = activeFilters[chip.key];
          const isPositive = val === 'true';
          const isNegative = val === 'false';
          const colors = COLOR_MAP[chip.color];
          const cls = isPositive ? colors.active : isNegative ? colors.negative : colors.inactive;
          const label = isNegative && chip.negLabel ? chip.negLabel : chip.label;
          const title = chip.noInverse
            ? undefined
            : isPositive
              ? `Click to filter for ${chip.negLabel ?? 'inverse'}`
              : isNegative
                ? 'Click to clear filter'
                : `Click to filter for ${chip.label}`;
          return (
            <button
              key={chip.key}
              onClick={() => handleChip(chip)}
              aria-pressed={isPositive || isNegative}
              title={title}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors mr-1 ${cls}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {hasFilters && (
        <button
          onClick={() => { clearFilters(); setSearch(''); }}
          className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
