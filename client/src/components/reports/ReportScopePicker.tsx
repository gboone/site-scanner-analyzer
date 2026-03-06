/**
 * ReportScopePicker — shown in DashboardView when no reportConfig is active.
 * Lets users pick an agency/bureau scope to build a report, or explains how
 * to generate a selection report from the Explorer or SqlView.
 */
import React from 'react';
import AgencyBureauFilter from '../AgencyBureauFilter';
import { useUIStore } from '../../store/uiStore';
import type { View } from '../../App';

interface Props {
  onNavigate: (view: View) => void;
}

export default function ReportScopePicker({ onNavigate }: Props) {
  const { setReport } = useUIStore();

  const [agencyInput, setAgencyInput] = React.useState('');
  const [bureauInput, setBureauInput] = React.useState('');

  const handleAgencySelect = (v: string) => {
    setAgencyInput(v);
    setBureauInput('');
  };

  const handleBureauSelect = (v: string) => {
    setBureauInput(v);
  };

  const handleGenerate = () => {
    if (!agencyInput) return;
    setReport({
      scope: 'agency',
      agency: agencyInput,
      bureaus: bureauInput ? [bureauInput] : undefined,
      label: [agencyInput, bureauInput].filter(Boolean).join(' › '),
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8 py-12 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Build a Report</h2>
        <p className="text-gray-500 text-sm">
          Choose a scope below, or select sites in the Explorer first.
        </p>
      </div>

      {/* Agency / bureau option */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 w-full shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-1">By Agency or Bureau</h3>
        <p className="text-xs text-gray-400 mb-4">
          Report on all sites matching an agency (and optionally a bureau).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <AgencyBureauFilter
            agency={agencyInput}
            bureau={bureauInput}
            onAgencyChange={setAgencyInput}
            onBureauChange={setBureauInput}
            onAgencySelect={handleAgencySelect}
            onBureauSelect={handleBureauSelect}
            onApply={handleGenerate}
            onClear={() => { setAgencyInput(''); setBureauInput(''); }}
            hasFilter={!!(agencyInput || bureauInput)}
          />
          <button
            onClick={handleGenerate}
            disabled={!agencyInput}
            className="btn-primary text-sm"
          >
            Generate report →
          </button>
        </div>
      </div>

      {/* Explorer selection option */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 w-full shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-1">From Explorer Selection</h3>
        <p className="text-xs text-gray-400 mb-4">
          Select rows in the Explorer table, then click "Dashboard report →" in the bulk
          action bar. Up to 1,000 domains for aggregate stats; up to 50 for a row-by-row
          summary table.
        </p>
        <button
          onClick={() => onNavigate('explorer')}
          className="btn-secondary text-sm"
        >
          ← Go to Explorer
        </button>
      </div>

      {/* SQL option */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 w-full shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-1">From a SQL Query</h3>
        <p className="text-xs text-gray-400 mb-4">
          Run a query in the SQL view that returns a <code className="font-mono bg-gray-100 px-1 rounded">domain</code> column,
          then click "Generate report →" in the results bar.
        </p>
        <button
          onClick={() => onNavigate('sql')}
          className="btn-secondary text-sm"
        >
          Open SQL view →
        </button>
      </div>
    </div>
  );
}
