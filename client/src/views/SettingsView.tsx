import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

function SettingField({
  label,
  description,
  value,
  onSave,
  type = 'text',
  placeholder,
  disabled,
}: {
  label: string;
  description: string;
  value: string;
  onSave: (val: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => { setDraft(value); }, [value]);

  return (
    <div className="flex items-start gap-4 py-4 border-b border-gray-100">
      <div className="w-56">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="flex-1">
        {editing ? (
          <div className="flex gap-2">
            <input
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue"
              autoFocus
            />
            <button onClick={() => { onSave(draft); setEditing(false); }} className="btn-primary text-xs">Save</button>
            <button onClick={() => { setDraft(value); setEditing(false); }} className="btn-secondary text-xs">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-600">
              {value ? (type === 'password' ? '••••••••' : value) : <span className="text-gray-300 italic">not set</span>}
            </span>
            {!disabled && (
              <button onClick={() => setEditing(true)} className="text-xs text-gov-blue hover:underline">
                {value ? 'Change' : 'Set'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsView() {
  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const s = settings as Record<string, string>;
  const [gleanStatus, setGleanStatus] = React.useState<string | null>(null);
  const [gsaStatus, setGsaStatus] = React.useState<string | null>(null);
  const [gsaAgency, setGsaAgency] = React.useState('');
  const [gsaImporting, setGsaImporting] = React.useState(false);
  const [gsaImportStatus, setGsaImportStatus] = React.useState<string | null>(null);
  const [gsaImportErrors, setGsaImportErrors] = React.useState<string[]>([]);
  const [gsaImportErrorCount, setGsaImportErrorCount] = React.useState(0);

  const handleSave = async (key: string, value: string) => {
    await api.setSetting(key, value);
    window.location.reload(); // Simple refresh to pick up new env
  };

  const testGlean = async () => {
    setGleanStatus('Testing…');
    try {
      const r = await api.testGlean() as any;
      setGleanStatus(r.connected ? '✓ Connected' : `✗ Failed: ${r.reason || r.status}`);
    } catch (err: any) {
      setGleanStatus(`✗ ${err.message}`);
    }
  };

  const importFromGSA = async () => {
    setGsaImporting(true);
    setGsaImportStatus(null);
    setGsaImportErrors([]);
    setGsaImportErrorCount(0);
    try {
      const r = await api.importFromGSA(gsaAgency.trim() || undefined) as any;
      const totalErrors: number = r.error_count ?? r.errors?.length ?? 0;
      setGsaImportStatus(
        `✓ Imported ${r.inserted} new, ${r.updated} updated of ${r.total_sites} total (${r.pages_fetched} pages)` +
        (totalErrors > 0 ? ` — ${totalErrors} errors` : '')
      );
      setGsaImportErrors(r.errors ?? []);
      setGsaImportErrorCount(totalErrors);
    } catch (err: any) {
      setGsaImportStatus(`✗ ${err.message}`);
    } finally {
      setGsaImporting(false);
    }
  };

  const testGSA = async () => {
    setGsaStatus('Testing…');
    try {
      const r = await api.testGSA() as any;
      setGsaStatus(r.connected ? '✓ Connected' : `✗ Failed (${r.reason || `HTTP ${r.status}`})`);
    } catch (err: any) {
      setGsaStatus(`✗ ${err.message}`);
    }
  };

  return (
    <div className="p-6 max-w-2xl overflow-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        API keys are stored in the <code className="bg-gray-100 px-1 rounded">.env</code> file at the project root.
        Changes here update the running server settings.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 px-4">
        <div className="py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
          Glean (Primary LLM)
        </div>
        <SettingField
          label="Glean Endpoint"
          description="Your org's Glean API base URL"
          value={s.GLEAN_ENDPOINT || ''}
          onSave={(v) => handleSave('GLEAN_ENDPOINT', v)}
          placeholder="https://your-org.glean.com/api/v1"
        />
        <SettingField
          label="Glean API Key"
          description="Bearer token for Glean Chat API"
          value={s.GLEAN_API_KEY || ''}
          onSave={(v) => handleSave('GLEAN_API_KEY', v)}
          type="password"
        />
        <div className="py-3 flex items-center gap-3">
          <button onClick={testGlean} className="btn-secondary text-xs">Test Connection</button>
          {gleanStatus && (
            <span className={`text-xs ${gleanStatus.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {gleanStatus}
            </span>
          )}
        </div>

        <div className="py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-y border-gray-100">
          GSA Site Scanner API
        </div>
        <SettingField
          label="GSA API Key"
          description="For fetching live data from api.gsa.gov"
          value={s.GSA_API_KEY || ''}
          onSave={(v) => handleSave('GSA_API_KEY', v)}
          type="password"
        />
        <div className="py-3 flex items-center gap-3">
          <button onClick={testGSA} className="btn-secondary text-xs">Test Connection</button>
          {gsaStatus && (
            <span className={`text-xs ${gsaStatus.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {gsaStatus}
            </span>
          )}
        </div>

        <div className="py-3 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-700 mb-2">Import from GSA</div>
          <div className="text-xs text-gray-500 mb-3">
            Fetches all site records from the GSA Site Scanning API and upserts them into the local database.
            Optionally filter by agency name (e.g. <code className="bg-gray-100 px-1 rounded">Department of Veterans Affairs</code>).
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={gsaAgency}
              onChange={(e) => setGsaAgency(e.target.value)}
              placeholder="Agency filter (optional)"
              className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue"
            />
            <button
              onClick={importFromGSA}
              disabled={gsaImporting}
              className="btn-primary text-xs whitespace-nowrap disabled:opacity-50"
            >
              {gsaImporting ? 'Importing…' : 'Import'}
            </button>
          </div>
          {gsaImportStatus && (
            <div className="mt-2">
              <div className={`text-xs ${gsaImportStatus.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {gsaImportStatus}
              </div>
              {gsaImportErrors.length > 0 && (
                <ul className="mt-1.5 text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto bg-red-50 rounded p-2 font-mono">
                  {gsaImportErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {gsaImportErrorCount > gsaImportErrors.length && (
                    <li className="text-gray-400 font-sans">…and {gsaImportErrorCount - gsaImportErrors.length} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-y border-gray-100">
          Anthropic Claude
        </div>
        <SettingField
          label="Anthropic API Key"
          description="For Claude-powered deep research briefings"
          value={s.ANTHROPIC_API_KEY || ''}
          onSave={(v) => handleSave('ANTHROPIC_API_KEY', v)}
          type="password"
        />
      </div>
    </div>
  );
}
