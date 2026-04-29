import React from 'react';
import type { Table } from './DataTable';
import { COLUMN_CATALOG, BASE_COLUMN_FIELDS } from '../../lib/columnCatalog';

interface ColumnToggleProps {
  table: Table<any> | null;
  extraColumns: string[];
  onAddColumn: (field: string) => void;
  onRemoveColumn: (field: string) => void;
}

/**
 * Dropdown with two sections:
 * 1. Show/hide current columns (existing behaviour + remove button for extras)
 * 2. Searchable picker to add any catalog column not already in the table
 */
export default function ColumnToggle({ table, extraColumns, onAddColumn, onRemoveColumn }: ColumnToggleProps) {
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

  // Focus search when panel opens
  React.useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  if (!table) return null;

  const toggleable = table.getAllColumns().filter((col: any) => col.getCanHide());
  const allVisible = toggleable.every((col: any) => col.getIsVisible());

  // Columns available to add: everything in catalog not already present as a base or extra column
  const extraSet = new Set(extraColumns);
  const addable = COLUMN_CATALOG.filter((col) => {
    if (BASE_COLUMN_FIELDS.has(col.field)) return false;
    if (extraSet.has(col.field)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return col.label.toLowerCase().includes(q) || col.field.includes(q) || col.group.toLowerCase().includes(q);
  });

  // Group addable columns for display
  const grouped = addable.reduce<Record<string, typeof addable>>((acc, col) => {
    (acc[col.group] ||= []).push(col);
    return acc;
  }, {});

  const hasSearch = search.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
          <rect x="1" y="3" width="14" height="2" rx="1"/>
          <rect x="1" y="7" width="10" height="2" rx="1"/>
          <rect x="1" y="11" width="12" height="2" rx="1"/>
        </svg>
        Columns
        {extraColumns.length > 0 && (
          <span className="ml-0.5 bg-gov-blue text-white rounded-full text-[10px] px-1.5 leading-tight">
            +{extraColumns.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-lg shadow-lg w-72">
          {/* Search input */}
          <div className="px-3 pt-2 pb-1 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search columns to show or add…"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gov-blue"
            />
          </div>

          {/* Show/hide existing columns — hidden when actively searching so results stay clean */}
          {!hasSearch && (
            <div className="border-b border-gray-100 max-h-48 overflow-y-auto">
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Visible columns</div>
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisible}
                  onChange={() => toggleable.forEach((col: any) => col.toggleVisibility(!allVisible))}
                  className="accent-gov-blue"
                />
                <span className="font-medium">Toggle all</span>
              </label>
              {toggleable.map((col: any) => {
                const isExtra = extraSet.has(col.id);
                const label = typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id;
                return (
                  <div key={col.id} className="flex items-center gap-1 px-3 py-1.5 hover:bg-gray-50 group">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer text-xs text-gray-700 min-w-0">
                      <input
                        type="checkbox"
                        checked={col.getIsVisible()}
                        onChange={col.getToggleVisibilityHandler()}
                        className="accent-gov-blue shrink-0"
                      />
                      <span className="truncate">{label}</span>
                    </label>
                    {isExtra && (
                      <button
                        onClick={() => onRemoveColumn(col.id)}
                        className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                        title={`Remove ${label} column`}
                        aria-label={`Remove ${label} column`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add column section */}
          <div className="max-h-64 overflow-y-auto">
            {!hasSearch && (
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Add column</div>
            )}
            {addable.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">
                {hasSearch ? 'No matching columns' : 'All available columns are visible'}
              </div>
            )}
            {hasSearch
              ? addable.map((col) => (
                  <button
                    key={col.field}
                    onClick={() => { onAddColumn(col.field); setSearch(''); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between gap-2"
                  >
                    <span className="text-gray-800">{col.label}</span>
                    <span className="text-gray-400 shrink-0">{col.group}</span>
                  </button>
                ))
              : Object.entries(grouped).map(([group, cols]) => (
                  <React.Fragment key={group}>
                    <div className="px-3 py-0.5 text-[10px] text-gray-400 bg-gray-50 border-t border-gray-100">{group}</div>
                    {cols.map((col) => (
                      <button
                        key={col.field}
                        onClick={() => onAddColumn(col.field)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-gray-700"
                      >
                        {col.label}
                      </button>
                    ))}
                  </React.Fragment>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
