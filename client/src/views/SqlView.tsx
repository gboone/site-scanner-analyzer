import React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import SqlEditor from '../components/sql/SqlEditor';
import { DataTable } from '../components/data-table/DataTable';
import { useSqlQuery, getQueryHistory, addToHistory } from '../hooks/useSqlQuery';
import { useUIStore } from '../store/uiStore';
import { SAMPLE_QUERIES } from '../lib/sampleQueries';
import type { QueryResult } from 'shared';

export default function SqlView() {
  const [sql, setSql] = React.useState(SAMPLE_QUERIES[0].sql);
  const [queryResult, setQueryResult] = React.useState<QueryResult | null>(null);
  const [history, setHistory] = React.useState<string[]>(getQueryHistory);
  const [showSamples, setShowSamples] = React.useState(false);
  const { openDetail } = useUIStore();
  const mutation = useSqlQuery();

  const handleRun = async () => {
    try {
      const result = await mutation.mutateAsync(sql);
      setQueryResult(result);
      addToHistory(sql);
      setHistory(getQueryHistory());
    } catch {
      // error shown from mutation.error
    }
  };

  // Build columns dynamically from first result row
  const columns = React.useMemo((): ColumnDef<Record<string, unknown>, any>[] => {
    if (!queryResult?.rows.length) return [];
    return Object.keys(queryResult.rows[0]).map((key) => ({
      accessorKey: key,
      header: key,
      size: 150,
      cell: (c: any) => {
        const val = c.getValue();
        if (val === null || val === undefined) return <span className="text-gray-300">—</span>;
        const str = String(val);
        return <span className="font-mono text-xs truncate max-w-[200px]" title={str}>{str}</span>;
      },
    }));
  }, [queryResult]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Editor panel */}
      <div className="flex-shrink-0 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-300 text-sm font-medium">SQL Query</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSamples(!showSamples)}
              aria-expanded={showSamples}
              aria-controls="sql-samples-panel"
              className="text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded px-2 py-1"
            >
              Samples <span aria-hidden="true">{showSamples ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={handleRun}
              disabled={mutation.isPending}
              className="btn-primary text-xs"
            >
              <span aria-hidden="true">{mutation.isPending ? '⟳ ' : '▶ '}</span>
              {mutation.isPending ? 'Running…' : 'Run (⌘↵)'}
            </button>
          </div>
        </div>

        <SqlEditor value={sql} onChange={setSql} onRun={handleRun} />

        {mutation.isError && (
          <div role="alert" className="text-red-400 text-xs bg-red-900/30 rounded p-2 font-mono">
            {mutation.error?.message}
          </div>
        )}

        {/* Sample queries */}
        {showSamples && (
          <div id="sql-samples-panel" className="bg-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto">
            <div className="text-xs text-gray-400 font-medium mb-2">Sample Queries</div>
            <div className="space-y-1">
              {SAMPLE_QUERIES.map((q) => (
                <button
                  key={q.label}
                  onClick={() => { setSql(q.sql); setShowSamples(false); }}
                  className="w-full text-left text-xs text-gray-300 hover:text-white hover:bg-gray-700 rounded px-2 py-1 transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Query history */}
        {history.length > 0 && !showSamples && (
          <div className="bg-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto">
            <div className="text-xs text-gray-400 font-medium mb-2">Recent Queries</div>
            <div className="space-y-1">
              {history.slice(0, 10).map((q, i) => (
                <button
                  key={i}
                  onClick={() => setSql(q)}
                  className="w-full text-left text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded px-2 py-1 font-mono truncate transition-colors"
                >
                  {q.replace(/\s+/g, ' ').slice(0, 80)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-hidden bg-white flex flex-col">
        {queryResult ? (
          <>
            <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span>{queryResult.count.toLocaleString()} row{queryResult.count !== 1 ? 's' : ''}</span>
              <span>{queryResult.duration_ms}ms</span>
            </div>
            <DataTable
              data={queryResult.rows}
              columns={columns}
              onRowClick={(row) => {
                const d = row.domain;
                if (d) openDetail(String(d));
              }}
              emptyMessage="Query returned no rows"
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Run a query to see results
          </div>
        )}
      </div>
    </div>
  );
}
