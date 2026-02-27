import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import BriefingView from './BriefingView';

interface ResearchPanelProps {
  domain: string;
  briefings: any[];
}

export default function ResearchPanel({ domain, briefings }: ResearchPanelProps) {
  const qc = useQueryClient();
  const [provider, setProvider] = React.useState<'glean' | 'claude'>('glean');
  const [scope, setScope] = React.useState('');
  const [selectedBriefing, setSelectedBriefing] = React.useState<any | null>(briefings[0] || null);

  const mutation = useMutation({
    mutationFn: () => api.createBriefing(domain, provider, scope || undefined) as any,
    onSuccess: (briefing: any) => {
      qc.invalidateQueries({ queryKey: ['site', domain] });
      setSelectedBriefing(briefing);
    },
  });

  return (
    <div className="divide-y divide-gray-100">
      {/* Generate panel */}
      <div className="p-4 space-y-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Generate Briefing</div>

        <div role="group" aria-label="Briefing provider" className="flex gap-2">
          {(['glean', 'claude'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              aria-pressed={provider === p}
              className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors ${
                provider === p
                  ? 'bg-gov-blue text-white border-gov-blue'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span aria-hidden="true">{p === 'glean' ? '🔍 ' : '🤖 '}</span>
              {p === 'glean' ? 'Glean' : 'Claude'}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="briefing-scope" className="sr-only">Optional focus area for the briefing</label>
          <textarea
            id="briefing-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="Optional: focus area (e.g., 'emphasis on accessibility compliance and DOGE initiatives')"
            className="w-full border border-gray-300 rounded px-2.5 py-2 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-gov-blue"
          />
        </div>

        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="w-full btn-primary text-xs justify-center"
        >
          <span aria-hidden="true">{mutation.isPending ? '⟳ ' : '🔬 '}</span>
          {mutation.isPending ? 'Researching… (this may take a minute)' : 'Generate Briefing'}
        </button>

        {mutation.isError && (
          <div role="alert" className="text-xs text-red-600 bg-red-50 rounded p-2">
            {mutation.error?.message}
          </div>
        )}
      </div>

      {/* Previous briefings list */}
      {briefings.length > 0 && (
        <div className="p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Previous Briefings
          </div>
          <div className="space-y-1">
            {briefings.map((b: any) => (
              <button
                key={b.id}
                onClick={() => setSelectedBriefing(b)}
                className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                  selectedBriefing?.id === b.id
                    ? 'bg-gov-blue-light text-gov-blue'
                    : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                {new Date(b.created_at).toLocaleDateString()} — {b.provider}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected briefing */}
      {selectedBriefing && <BriefingView briefing={selectedBriefing} />}
    </div>
  );
}
