import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import ApiKeysSection from '../components/settings/ApiKeysSection';

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
              aria-label={label}
              className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue"
              autoFocus
            />
            <button onClick={() => { onSave(draft); setEditing(false); }} aria-label={`Save ${label}`} className="btn-primary text-xs">Save</button>
            <button onClick={() => { setDraft(value); setEditing(false); }} aria-label={`Cancel editing ${label}`} className="btn-secondary text-xs">Cancel</button>
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

const INTERVAL_LABELS: Record<string, string> = {
  '6h': 'Every 6 hours',
  '12h': 'Every 12 hours',
  '24h': 'Daily (2 AM)',
  '48h': 'Every 2 days',
  'weekly': 'Weekly (Sunday 2 AM)',
};

const FILTER_LABELS: Record<string, string> = {
  all: 'All sites',
  public: 'Public only (not excluded)',
  live: 'Live sites only',
};

export default function SettingsView() {
  const queryClient = useQueryClient();
  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const s = settings as Record<string, string>;
  const [gsaStatus, setGsaStatus] = React.useState<string | null>(null);
  const [gsaAgency, setGsaAgency] = React.useState('');
  const [gsaImporting, setGsaImporting] = React.useState(false);
  const [gsaImportStatus, setGsaImportStatus] = React.useState<string | null>(null);
  const [gsaImportErrors, setGsaImportErrors] = React.useState<string[]>([]);
  const [gsaImportErrorCount, setGsaImportErrorCount] = React.useState(0);

  // get.gov import state
  const [getgovImporting, setGetgovImporting] = React.useState(false);
  const [getgovImportStatus, setGetgovImportStatus] = React.useState<string | null>(null);
  const [getgovImportErrors, setGetgovImportErrors] = React.useState<string[]>([]);

  // Scheduler state
  const { data: schedulerData, refetch: refetchScheduler } = useQuery({
    queryKey: ['scheduler-status'],
    queryFn: () => api.getSchedulerStatus(),
  });
  const [gsaSched, setGsaSched] = React.useState({ enabled: false, interval: '24h', agency: '' });
  const [scanSched, setScanSched] = React.useState({ enabled: false, interval: '24h', filter: 'all' });
  const [getgovSched, setGetgovSched] = React.useState({ enabled: false, interval: '24h' });
  const [schedSaving, setSchedSaving] = React.useState(false);
  const [gsaRunStatus, setGsaRunStatus] = React.useState<string | null>(null);
  const [scanRunStatus, setScanRunStatus] = React.useState<string | null>(null);
  const [scanStopStatus, setScanStopStatus] = React.useState<string | null>(null);
  const [getgovRunStatus, setGetgovRunStatus] = React.useState<string | null>(null);

  // Sync scheduler form state when data loads
  React.useEffect(() => {
    if (schedulerData) {
      setGsaSched({
        enabled: schedulerData.gsa.enabled,
        interval: schedulerData.gsa.interval || '24h',
        agency: schedulerData.gsa.agency || '',
      });
      setScanSched({
        enabled: schedulerData.scan.enabled,
        interval: schedulerData.scan.interval || '24h',
        filter: schedulerData.scan.filter || 'all',
      });
      setGetgovSched({
        enabled: schedulerData.getgov.enabled,
        interval: schedulerData.getgov.interval || '24h',
      });
    }
  }, [schedulerData]);

  const handleSave = async (key: string, value: string) => {
    await api.setSetting(key, value);
    window.location.reload(); // Simple refresh to pick up new env
  };

  const importFromGSA = async () => {
    setGsaImporting(true);
    setGsaImportStatus(null);
    setGsaImportErrors([]);
    setGsaImportErrorCount(0);
    try {
      const r = await api.importFromGSA(gsaAgency.trim() || undefined, (progress) => {
        setGsaImportStatus(
          `Fetching page ${progress.page} of ${progress.totalPages}… (${progress.inserted} new, ${progress.updated} updated)`
        );
      }) as any;
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

  const importFromGetGovRegistry = async () => {
    setGetgovImporting(true);
    setGetgovImportStatus(null);
    setGetgovImportErrors([]);
    try {
      const r = await api.importFromGetGov((progress) => {
        setGetgovImportStatus(
          `Processing row ${progress.processed} of ${progress.total}… (${progress.inserted} new, ${progress.updated} updated)`
        );
      }) as any;
      setGetgovImportStatus(
        `✓ ${r.total_rows?.toLocaleString()} rows parsed — ${r.inserted} new domains (${r.new_federal} federal, ${r.new_nonfederal} non-federal), ${r.updated} updated` +
        (r.error_count > 0 ? ` — ${r.error_count} errors` : '')
      );
      setGetgovImportErrors(r.errors ?? []);
    } catch (err: any) {
      setGetgovImportStatus(`✗ ${err.message}`);
    } finally {
      setGetgovImporting(false);
    }
  };

  const saveScheduler = async () => {
    setSchedSaving(true);
    try {
      await api.updateGsaSchedule({ enabled: gsaSched.enabled, interval: gsaSched.interval, agency: gsaSched.agency || undefined });
      await api.updateScanSchedule({ enabled: scanSched.enabled, interval: scanSched.interval, filter: scanSched.filter });
      await api.updateGetGovSchedule({ enabled: getgovSched.enabled, interval: getgovSched.interval });
      await refetchScheduler();
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSchedSaving(false);
    }
  };

  const triggerGsa = async () => {
    setGsaRunStatus('Triggering…');
    try {
      await api.triggerGsaRefresh();
      setGsaRunStatus('Triggered — check server logs for progress');
      setTimeout(() => { refetchScheduler(); }, 3000);
    } catch (err: any) {
      setGsaRunStatus(`✗ ${err.message}`);
    }
  };

  const triggerGetGov = async () => {
    setGetgovRunStatus('Triggering…');
    try {
      await api.triggerGetGovRefresh();
      setGetgovRunStatus('Triggered — check server logs for progress');
      setTimeout(() => { refetchScheduler(); }, 3000);
    } catch (err: any) {
      setGetgovRunStatus(`✗ ${err.message}`);
    }
  };

  const triggerScan = async () => {
    setScanRunStatus('Triggering…');
    setScanStopStatus(null);
    try {
      await api.triggerSiteRescan();
      setScanRunStatus('Triggered — check Scan Sessions for progress');
      setTimeout(() => { refetchScheduler(); }, 3000);
    } catch (err: any) {
      setScanRunStatus(`✗ ${err.message}`);
    }
  };

  // Claude chat settings — API key + model dropdown (populated from the Models API)
  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () =>
      api.listModels()
        .then((r) => r.data)
        .catch(() => [] as { id: string; display_name: string }[]),
    enabled: !!s.ANTHROPIC_API_KEY,
  });

  const FALLBACK_MODELS: { id: string; display_name: string }[] = [
    { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-8',   display_name: 'Claude Opus 4.8' },
    { id: 'claude-haiku-4-5',  display_name: 'Claude Haiku 4.5' },
  ];
  const modelOptions = models.length ? models : FALLBACK_MODELS;
  const currentModel = s.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  const stopScan = async () => {
    setScanStopStatus('Stopping…');
    try {
      const r = await api.stopSiteRescan() as any;
      setScanStopStatus(r.stopped ? '⏹ Stop requested — finishing current sites' : '✗ No scan was running');
      setTimeout(() => { refetchScheduler(); }, 2000);
    } catch (err: any) {
      setScanStopStatus(`✗ ${err.message}`);
    }
  };

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        API keys are stored in the <code className="bg-gray-100 px-1 rounded">.env</code> file at the project root.
        Changes here update the running server settings.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 px-4">
        <div className="py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
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
            <label htmlFor="gsa-agency-filter" className="sr-only">Agency filter for GSA import (optional)</label>
            <input
              id="gsa-agency-filter"
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
              <div className={`text-xs ${gsaImportStatus.startsWith('✓') ? 'text-green-600' : gsaImporting ? 'text-gray-500' : 'text-red-600'}`}>
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
          get.gov Registry
        </div>
        <div className="py-3 border-b border-gray-100">
          <div className="text-xs font-medium text-gray-700 mb-1">Import from get.gov</div>
          <div className="text-xs text-gray-500 mb-3">
            Fetches the full CISA .gov domain registry (federal, state, tribal, county, city, and more) and
            upserts all records into the local database. New domains are queued for scanning automatically.
            Non-federal domains also get subdomain discovery via Certificate Transparency logs.
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={importFromGetGovRegistry}
              disabled={getgovImporting}
              className="btn-primary text-xs whitespace-nowrap disabled:opacity-50"
            >
              {getgovImporting ? 'Importing…' : 'Import from get.gov'}
            </button>
          </div>
          {getgovImportStatus && (
            <div className="mt-2">
              <div className={`text-xs ${getgovImportStatus.startsWith('✓') ? 'text-green-600' : getgovImporting ? 'text-gray-500' : 'text-red-600'}`}>
                {getgovImportStatus}
              </div>
              {getgovImportErrors.length > 0 && (
                <ul className="mt-1.5 text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto bg-red-50 rounded p-2 font-mono">
                  {getgovImportErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Claude chat */}
      <div className="bg-white rounded-lg border border-gray-200 px-4 mt-6">
        <div className="py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
          Claude Chat
        </div>
        <p className="text-xs text-gray-500 mt-3 mb-1">
          Supply an Anthropic API key to chat about this data. Claude answers by
          querying the same public REST endpoints the rest of the app uses.
        </p>
        <SettingField
          label="Anthropic API Key"
          description="Stored server-side. Used to call the Claude API."
          value={s.ANTHROPIC_API_KEY || ''}
          onSave={(v) => handleSave('ANTHROPIC_API_KEY', v)}
          type="password"
        />
        <div className="flex items-start gap-4 py-4">
          <div className="w-56">
            <div className="text-sm font-medium text-gray-800">Model</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {models.length
                ? 'Live list from your account.'
                : 'Showing common models — add a key to load the live list.'}
            </div>
          </div>
          <div className="flex-1">
            <select
              value={currentModel}
              aria-label="Claude model"
              onChange={(e) => handleSave('ANTHROPIC_MODEL', e.target.value)}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue"
            >
              {modelOptions.some((m) => m.id === currentModel)
                ? null
                : <option value={currentModel}>{currentModel}</option>}
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Scheduled Jobs */}
      <div className="bg-white rounded-lg border border-gray-200 px-4 mt-6">
        <div className="py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
          Scheduled Jobs
        </div>
        <p className="text-xs text-gray-500 mt-3 mb-1">
          Automated background tasks that run server-side on a configurable interval — no browser session needed.
        </p>

        {/* GSA Refresh */}
        <div className="py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-gray-800">GSA Data Refresh</div>
              <div className="text-xs text-gray-500 mt-0.5">Pull fresh site records from the GSA Site Scanner API</div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">{gsaSched.enabled ? 'Enabled' : 'Disabled'}</span>
              <div
                role="switch"
                aria-checked={gsaSched.enabled}
                onClick={() => setGsaSched(p => ({ ...p, enabled: !p.enabled }))}
                className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${gsaSched.enabled ? 'bg-gov-blue' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${gsaSched.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Interval</label>
              <select
                value={gsaSched.interval}
                onChange={e => setGsaSched(p => ({ ...p, interval: e.target.value }))}
                disabled={!gsaSched.enabled}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue disabled:opacity-40"
              >
                {Object.entries(INTERVAL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Agency filter (optional)</label>
              <input
                type="text"
                value={gsaSched.agency}
                onChange={e => setGsaSched(p => ({ ...p, agency: e.target.value }))}
                placeholder="e.g. Department of Veterans Affairs"
                disabled={!gsaSched.enabled}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue disabled:opacity-40"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={triggerGsa} className="btn-secondary text-xs">Run now</button>
            {gsaRunStatus && <span className="text-xs text-gray-500">{gsaRunStatus}</span>}
          </div>
          {schedulerData?.gsa.last_run && (
            <div className="mt-2 text-xs text-gray-400">
              Last run: {new Date(schedulerData.gsa.last_run).toLocaleString()}
              {schedulerData.gsa.last_status && (
                <span className={`ml-2 ${schedulerData.gsa.last_status.startsWith('ok') ? 'text-green-600' : 'text-red-500'}`}>
                  — {schedulerData.gsa.last_status}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Site Rescan */}
        <div className="py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-gray-800">Site Rescan</div>
              <div className="text-xs text-gray-500 mt-0.5">Re-scan all (or filtered) sites in the database</div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">{scanSched.enabled ? 'Enabled' : 'Disabled'}</span>
              <div
                role="switch"
                aria-checked={scanSched.enabled}
                onClick={() => setScanSched(p => ({ ...p, enabled: !p.enabled }))}
                className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${scanSched.enabled ? 'bg-gov-blue' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${scanSched.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Interval</label>
              <select
                value={scanSched.interval}
                onChange={e => setScanSched(p => ({ ...p, interval: e.target.value }))}
                disabled={!scanSched.enabled}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue disabled:opacity-40"
              >
                {Object.entries(INTERVAL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Sites to scan</label>
              <select
                value={scanSched.filter}
                onChange={e => setScanSched(p => ({ ...p, filter: e.target.value }))}
                disabled={!scanSched.enabled}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue disabled:opacity-40"
              >
                {Object.entries(FILTER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button onClick={triggerScan} disabled={!!schedulerData?.scan.scan_is_running} className="btn-secondary text-xs disabled:opacity-40">Run now</button>
            {schedulerData?.scan.scan_is_running && (
              <button onClick={stopScan} className="btn-secondary text-xs text-red-600 border-red-300 hover:border-red-500">
                ⏹ Stop scan
              </button>
            )}
            {scanRunStatus && <span className="text-xs text-gray-500">{scanRunStatus}</span>}
            {scanStopStatus && <span className={`text-xs ${scanStopStatus.startsWith('✗') ? 'text-red-600' : 'text-yellow-600'}`}>{scanStopStatus}</span>}
          </div>
          {schedulerData?.scan.last_run && (
            <div className="mt-2 text-xs text-gray-400">
              Last run: {new Date(schedulerData.scan.last_run).toLocaleString()}
              {schedulerData.scan.last_status && (
                <span className={`ml-2 ${schedulerData.scan.last_status.startsWith('ok') ? 'text-green-600' : 'text-red-500'}`}>
                  — {schedulerData.scan.last_status}
                </span>
              )}
            </div>
          )}
        </div>

        {/* get.gov Registry Sync */}
        <div className="py-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-gray-800">get.gov Registry Sync</div>
              <div className="text-xs text-gray-500 mt-0.5">Refresh the full CISA .gov domain registry (all government levels)</div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">{getgovSched.enabled ? 'Enabled' : 'Disabled'}</span>
              <div
                role="switch"
                aria-checked={getgovSched.enabled}
                onClick={() => setGetgovSched(p => ({ ...p, enabled: !p.enabled }))}
                className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${getgovSched.enabled ? 'bg-gov-blue' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${getgovSched.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Interval</label>
              <select
                value={getgovSched.interval}
                onChange={e => setGetgovSched(p => ({ ...p, interval: e.target.value }))}
                disabled={!getgovSched.enabled}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue disabled:opacity-40"
              >
                {Object.entries(INTERVAL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={triggerGetGov} className="btn-secondary text-xs">Run now</button>
            {getgovRunStatus && <span className="text-xs text-gray-500">{getgovRunStatus}</span>}
          </div>
          {schedulerData?.getgov.last_run && (
            <div className="mt-2 text-xs text-gray-400">
              Last run: {new Date(schedulerData.getgov.last_run).toLocaleString()}
              {schedulerData.getgov.last_status && (
                <span className={`ml-2 ${schedulerData.getgov.last_status.startsWith('ok') ? 'text-green-600' : 'text-red-500'}`}>
                  — {schedulerData.getgov.last_status}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={saveScheduler}
            disabled={schedSaving}
            className="btn-primary text-xs disabled:opacity-50"
          >
            {schedSaving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>

      <ApiKeysSection />
      </div>
    </div>
  );
}
