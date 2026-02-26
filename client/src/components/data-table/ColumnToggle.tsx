import React from 'react';
import type { Table } from './DataTable';

interface ColumnToggleProps {
  table: Table<any> | null;
}

/**
 * Dropdown button that lets users show/hide individual table columns.
 * Receives the TanStack Table instance via the DataTable onTableReady callback.
 */
export default function ColumnToggle({ table }: ColumnToggleProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!table) return null;

  const toggleable = table
    .getAllColumns()
    .filter((col: any) => col.getCanHide());

  const allVisible = toggleable.every((col: any) => col.getIsVisible());

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
        title="Toggle columns"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="3" width="14" height="2" rx="1"/>
          <rect x="1" y="7" width="10" height="2" rx="1"/>
          <rect x="1" y="11" width="12" height="2" rx="1"/>
        </svg>
        Columns
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
          {/* Toggle all */}
          <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
            <input
              type="checkbox"
              checked={allVisible}
              onChange={() =>
                toggleable.forEach((col: any) => col.toggleVisibility(!allVisible))
              }
              className="accent-gov-blue"
            />
            <span className="font-medium">Toggle all</span>
          </label>
          {toggleable.map((col: any) => (
            <label
              key={col.id}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={col.getIsVisible()}
                onChange={col.getToggleVisibilityHandler()}
                className="accent-gov-blue"
              />
              <span>{typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
