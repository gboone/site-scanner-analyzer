import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Table,
} from '@tanstack/react-table';

export type { Table };

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  getRowKey?: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Called once when the table instance is ready, useful for ColumnToggle */
  onTableReady?: (table: Table<T>) => void;
  /** Enable bulk-select checkboxes */
  selectable?: boolean;
  selectedRows?: Set<string>;
  onToggleRow?: (key: string) => void;
  onToggleAll?: (keys: string[]) => void;
  /** Controlled server-side sort — column id currently sorted */
  sortColumn?: string;
  /** Controlled server-side sort — current direction */
  sortOrder?: 'asc' | 'desc';
  /** Called when the user clicks a column header to change the sort */
  onSortChange?: (column: string, order: 'asc' | 'desc') => void;
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  selectedKey,
  getRowKey,
  isLoading,
  emptyMessage = 'No results',
  onTableReady,
  selectable,
  selectedRows,
  onToggleRow,
  onToggleAll,
  sortColumn,
  sortOrder,
  onSortChange,
}: DataTableProps<T>) {
  // Derive TanStack sorting state from controlled props so indicators render correctly.
  // manualSorting: true means TanStack never reorders rows — the server does that.
  const sortingState: SortingState = sortColumn
    ? [{ id: sortColumn, desc: sortOrder === 'desc' }]
    : [];

  const table = useReactTable({
    data,
    columns,
    state: { sorting: sortingState },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  // Expose table instance to parent after first render
  const onTableReadyRef = React.useRef(onTableReady);
  onTableReadyRef.current = onTableReady;
  React.useEffect(() => {
    onTableReadyRef.current?.(table as unknown as Table<T>);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <div className="text-center">
          <div className="animate-spin text-2xl mb-2">⟳</div>
          <div>Loading…</div>
        </div>
      </div>
    );
  }

  // Derive header checkbox state for the current page
  const pageKeys = selectable
    ? table.getRowModel().rows.map((row) =>
        getRowKey ? getRowKey(row.original) : String((row.original as any).domain)
      )
    : [];
  const checkedCount = pageKeys.filter((k) => selectedRows?.has(k)).length;
  const allChecked = pageKeys.length > 0 && checkedCount === pageKeys.length;
  const someChecked = checkedCount > 0 && !allChecked;

  const colSpanTotal = columns.length + (selectable ? 1 : 0);

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="bg-gray-100 border-b border-gray-200">
              {selectable && (
                <th className="px-2 py-2 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked; }}
                    onChange={() => onToggleAll?.(pageKeys)}
                    className="cursor-pointer accent-gov-blue"
                    title={allChecked ? 'Deselect all on page' : 'Select all on page'}
                  />
                </th>
              )}
              {hg.headers.map((header) => {
                const colId = header.column.id;
                const isSorted = sortColumn === colId;
                const handleHeaderClick = onSortChange
                  ? () => {
                      // Toggle direction if already sorted by this column, otherwise default to asc
                      const newOrder = isSorted && sortOrder === 'asc' ? 'desc' : 'asc';
                      onSortChange(colId, newOrder);
                    }
                  : undefined;
                return (
                  <th
                    key={header.id}
                    className={`px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap select-none hover:bg-gray-200 transition-colors ${onSortChange ? 'cursor-pointer' : ''}`}
                    style={{ width: header.getSize() }}
                    onClick={handleHeaderClick}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {isSorted && sortOrder === 'asc' && <span className="text-gov-blue">↑</span>}
                      {isSorted && sortOrder === 'desc' && <span className="text-gov-blue">↓</span>}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={colSpanTotal} className="text-center py-12 text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => {
              const key = getRowKey ? getRowKey(row.original) : String((row.original as any).domain);
              const isSingleSelected = selectedKey === key;
              const isBulkSelected = selectable && (selectedRows?.has(key) ?? false);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    isBulkSelected
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : isSingleSelected
                      ? 'bg-gov-blue-light'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {selectable && (
                    <td className="px-2 py-2 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={isBulkSelected}
                        onChange={() => onToggleRow?.(key)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer accent-gov-blue"
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 whitespace-nowrap max-w-xs truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
