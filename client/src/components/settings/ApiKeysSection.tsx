import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function ApiKeysSection() {
  const qc = useQueryClient();
  const [label, setLabel] = React.useState('');
  const [ownerEmail, setOwnerEmail] = React.useState('');
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [revealedToken, setRevealedToken] = React.useState<string | null>(null);
  const [confirmingRevokeId, setConfirmingRevokeId] = React.useState<number | null>(null);
  const revealRef = React.useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.listApiKeys(),
  });
  const keys = data?.data ?? [];

  React.useEffect(() => {
    if (revealedToken) revealRef.current?.focus();
  }, [revealedToken]);

  const createMutation = useMutation({
    mutationFn: () => api.createApiKey(label.trim(), ownerEmail.trim()),
    onSuccess: (created) => {
      setRevealedToken(created.token);
      setLabel('');
      setOwnerEmail('');
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: any) => setCreateError(err.message || 'Failed to create key'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => api.revokeApiKey(id),
    onSuccess: () => {
      setConfirmingRevokeId(null);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 mt-6">
      <div className="py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
        API Keys
      </div>
      <p className="text-xs text-gray-500 mt-3 mb-1">
        Self-service keys for external tools (e.g. Claude Desktop) to read this app's public data over the API.
        Read-only — scoped to <code className="bg-gray-100 px-1 rounded">GET</code> requests, excluding settings and
        key management. Every key below is visible to and revocable by anyone with access to this page — there's
        no per-user login to scope by.
      </p>

      {revealedToken && (
        <div
          ref={revealRef}
          role="alert"
          tabIndex={-1}
          className="mt-3 p-3 rounded border border-yellow-300 bg-yellow-50"
        >
          <div className="text-xs font-medium text-yellow-800 mb-1">
            Copy this now — it won't be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white border border-yellow-200 rounded px-2 py-1 overflow-x-auto">
              {revealedToken}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(revealedToken)}
              className="btn-secondary text-xs whitespace-nowrap"
            >
              Copy
            </button>
            <button
              onClick={() => setRevealedToken(null)}
              className="btn-secondary text-xs whitespace-nowrap"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="py-4 border-b border-gray-100">
        <div className="text-xs font-medium text-gray-700 mb-2">New key</div>
        <div className="flex gap-2 items-start flex-wrap">
          <div>
            <label htmlFor="api-key-label" className="sr-only">Label</label>
            <input
              id="api-key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. My Claude Desktop)"
              className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue"
            />
          </div>
          <div>
            <label htmlFor="api-key-owner-email" className="sr-only">Owner email</label>
            <input
              id="api-key-owner-email"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="you@a8c.com"
              className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue"
            />
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!label.trim() || !ownerEmail.trim() || createMutation.isPending}
            className="btn-primary text-xs whitespace-nowrap disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating…' : 'Create key'}
          </button>
        </div>
        {createError && <div className="mt-2 text-xs text-red-600">{createError}</div>}
      </div>

      <div className="py-4">
        {isLoading && <div className="text-xs text-gray-400">Loading…</div>}
        {isError && <div className="text-xs text-red-600">Failed to load API keys.</div>}
        {!isLoading && !isError && keys.length === 0 && (
          <div className="text-xs text-gray-400 italic">No API keys yet</div>
        )}
        {keys.map((key) => (
          <div key={key.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div>
              <div className="text-sm text-gray-800">{key.label}</div>
              <div className="text-xs text-gray-500">
                {key.owner_email} · created {new Date(key.created_at).toLocaleDateString()} · last used{' '}
                {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'never'}
              </div>
            </div>
            {key.revoked_at ? (
              <span className="text-xs text-gray-400 whitespace-nowrap">Revoked</span>
            ) : confirmingRevokeId === key.id ? (
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-xs text-gray-600">Revoke "{key.label}" ({key.owner_email})?</span>
                <button
                  onClick={() => revokeMutation.mutate(key.id)}
                  disabled={revokeMutation.isPending}
                  className="btn-secondary text-xs text-red-600 border-red-300 hover:border-red-500 disabled:opacity-50"
                >
                  Confirm
                </button>
                <button onClick={() => setConfirmingRevokeId(null)} className="btn-secondary text-xs">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingRevokeId(key.id)}
                className="btn-secondary text-xs whitespace-nowrap"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
