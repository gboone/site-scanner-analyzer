import React from 'react';
import { COLUMN_CATALOG } from '../../lib/columnCatalog';

/** Extra dimensions not in the catalog but valid for grouping */
const EXTRA_DIMENSIONS = [
  { field: 'final_domain', label: 'Final Redirect Domain', group: 'Core' },
];

/** All groupable dimensions: text + int catalog fields, plus extras. */
const ALL_GROUPABLE = [
  ...EXTRA_DIMENSIONS,
  ...COLUMN_CATALOG.filter((c) => c.type === 'text' || c.type === 'int'),
];

interface GroupByPickerProps {
  groupByField: string | null;
  groupByOrder: 'asc' | 'desc';
  onGroupByChange: (field: string | null) => void;
  onOrderChange: (order: 'asc' | 'desc') => void;
}

export default function GroupByPicker({
  groupByField,
  groupByOrder,
  onGroupByChange,
  onOrderChange,
}: GroupByPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) { setSearch(''); return; }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const activeDim = ALL_GROUPABLE.find((c) => c.field === groupByField) ?? null;

  const filtered = ALL_GROUPABLE.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.field.includes(q) ||
      c.group.toLowerCase().includes(q)
    );
  });

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, col) => {
    (acc[col.group] ||= []).push(col);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      {activeDim ? (
        /* Active state — pill showing the current grouping */
        <div className="flex items-center text-xs font-medium rounded border border-gov-blue bg-gov-blue text-white overflow-hidden">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="true"
            className="flex items-center gap-1 pl-2.5 pr-1 py-1.5 hover:bg-blue-700 transition-colors"
            title="Change grouping dimension"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="1" y="2" width="14" height="2.5" rx="1.25"/>
              <rect x="1" y="6.75" width="14" height="2.5" rx="1.25"/>
              <rect x="1" y="11.5" width="14" height="2.5" rx="1.25"/>
            </svg>
            <span>Group: {activeDim.label}</span>
            <span aria-hidden="true" className="text-[10px] opacity-75 ml-0.5">▾</span>
          </button>
          {/* Asc / desc sort toggle */}
          <button
            onClick={() => onOrderChange(groupByOrder === 'asc' ? 'desc' : 'asc')}
            title={groupByOrder === 'asc' ? 'A → Z (click for Z → A)' : 'Z → A (click for A → Z)'}
            aria-label={groupByOrder === 'asc' ? 'Currently ascending, click for descending' : 'Currently descending, click for ascending'}
            className="px-1.5 py-1.5 hover:bg-blue-700 transition-colors border-l border-blue-500 font-mono"
          >
            {groupByOrder === 'asc' ? '↑' : '↓'}
          </button>
          {/* Clear */}
          <button
            onClick={() => { onGroupByChange(null); setOpen(false); }}
            aria-label="Remove grouping"
            title="Remove grouping"
            className="px-1.5 py-1.5 hover:bg-blue-700 transition-colors border-l border-blue-500 text-blue-200 hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : (
        /* Inactive state — plain button */
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="1" y="2" width="14" height="2.5" rx="1.25"/>
            <rect x="1" y="6.75" width="14" height="2.5" rx="1.25"/>
            <rect x="1" y="11.5" width="14" height="2.5" rx="1.25"/>
          </svg>
          Group by
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-9 z-30 bg-white border border-gray-200 rounded-lg shadow-lg w-72">
          {/* Search */}
          <div className="px-3 pt-2 pb-1 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search dimensions…"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gov-blue"
            />
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* Remove grouping option — only when one is active and not already searching */}
            {activeDim && !search && (
              <button
                onClick={() => { onGroupByChange(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100"
              >
                ✕ Remove grouping
              </button>
            )}

            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No matching dimensions</div>
            )}

            {Object.entries(grouped).map(([group, cols]) => (
              <React.Fragment key={group}>
                <div className="px-3 py-0.5 text-[10px] text-gray-400 bg-gray-50 border-t border-gray-100 first:border-t-0">
                  {group}
                </div>
                {cols.map((col) => {
                  const isActive = col.field === groupByField;
                  return (
                    <button
                      key={col.field}
                      onClick={() => {
                        onGroupByChange(col.field);
                        setSearch('');
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between gap-2 ${
                        isActive ? 'text-gov-blue font-semibold' : 'text-gray-700'
                      }`}
                    >
                      <span>{col.label}</span>
                      {isActive && <span aria-hidden="true" className="text-gov-blue shrink-0">✓</span>}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
