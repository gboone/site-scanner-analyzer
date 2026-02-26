import React, { useRef } from 'react';
import { marked } from 'marked';
import { api } from '../../lib/api';

interface BriefingViewProps {
  briefing: any;
}

export default function BriefingView({ briefing }: BriefingViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const refs: any[] = briefing.references_json
    ? JSON.parse(briefing.references_json)
    : [];

  const html = briefing.full_markdown
    ? marked.parse(briefing.full_markdown, { async: false }) as string
    : '';

  const handleExport = () => {
    window.open(api.exportBriefing(briefing.id), '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-gray-500">
            {briefing.provider.toUpperCase()} · {new Date(briefing.created_at).toLocaleString()}
          </div>
          {briefing.duration_ms && (
            <div className="text-xs text-gray-400">{(briefing.duration_ms / 1000).toFixed(1)}s</div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={handleExport} className="btn-secondary text-xs">↓ Markdown</button>
          <button onClick={handlePrint} className="btn-secondary text-xs no-print">🖨 Print</button>
        </div>
      </div>

      {/* References with verified badges */}
      {refs.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-600 mb-2">References</div>
          <div className="space-y-1.5">
            {refs.map((ref: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={ref.verified ? 'text-green-500' : 'text-yellow-500'} title={ref.verified ? 'Verified' : 'Could not verify'}>
                  {ref.verified ? '✓' : '⚠'}
                </span>
                <div className="min-w-0">
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gov-blue hover:underline font-medium break-words"
                  >
                    {ref.title}
                  </a>
                  {ref.description && (
                    <p className="text-gray-500 mt-0.5">{ref.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Markdown content */}
      <div
        ref={contentRef}
        className="prose prose-sm max-w-none text-gray-800 text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
