import React from 'react';

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
}

export default function Pagination({ page, pages, total, limit, onPage }: PaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white border-t border-gray-200 text-xs text-gray-500">
      <span>{total > 0 ? `${start}–${end} of ${total.toLocaleString()}` : '0 results'}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(1)}
          disabled={page === 1}
          className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          «
        </button>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          ‹
        </button>
        <span className="px-2">
          Page {page} of {pages || 1}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          ›
        </button>
        <button
          onClick={() => onPage(pages)}
          disabled={page >= pages}
          className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          »
        </button>
      </div>
    </div>
  );
}
