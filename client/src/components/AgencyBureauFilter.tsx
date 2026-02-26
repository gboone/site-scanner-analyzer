import React from 'react';
import { api } from '../lib/api';

interface Suggestion {
  value: string;
  count: number;
}

interface TypeaheadInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  suggestions: Suggestion[];
  showDropdown: boolean;
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function TypeaheadInput({
  id, label, placeholder, value, suggestions, showDropdown,
  onChange, onSelect, onFocus, onBlur, onKeyDown,
}: TypeaheadInputProps) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue w-64"
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 w-full bg-white border border-gray-200 rounded shadow-lg max-h-56 overflow-y-auto text-sm">
          {suggestions.map((s) => (
            <li
              key={s.value}
              // Use onMouseDown instead of onClick so it fires before onBlur hides the dropdown
              onMouseDown={(e) => { e.preventDefault(); onSelect(s.value); }}
              className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 flex justify-between items-center gap-2"
            >
              <span className="truncate">{s.value}</span>
              <span className="text-gray-400 text-xs shrink-0">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  agency: string;
  bureau: string;
  onAgencyChange: (v: string) => void;
  onBureauChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
  hasFilter: boolean;
}

export default function AgencyBureauFilter({
  agency, bureau, onAgencyChange, onBureauChange, onApply, onClear, hasFilter,
}: Props) {
  const [agencySuggestions, setAgencySuggestions] = React.useState<Suggestion[]>([]);
  const [bureauSuggestions, setBureauSuggestions] = React.useState<Suggestion[]>([]);
  const [showAgencyDrop, setShowAgencyDrop] = React.useState(false);
  const [showBureauDrop, setShowBureauDrop] = React.useState(false);

  // Debounce refs
  const agencyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const bureauTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAgencySuggestions = (q: string) => {
    if (agencyTimer.current) clearTimeout(agencyTimer.current);
    agencyTimer.current = setTimeout(async () => {
      try {
        const results = await api.getAgencySuggestions(q);
        setAgencySuggestions(results);
      } catch {
        setAgencySuggestions([]);
      }
    }, 200);
  };

  const fetchBureauSuggestions = (q: string, scopedAgency: string) => {
    if (bureauTimer.current) clearTimeout(bureauTimer.current);
    bureauTimer.current = setTimeout(async () => {
      try {
        const results = await api.getBureauSuggestions(q, scopedAgency || undefined);
        setBureauSuggestions(results);
      } catch {
        setBureauSuggestions([]);
      }
    }, 200);
  };

  const handleAgencyChange = (v: string) => {
    onAgencyChange(v);
    fetchAgencySuggestions(v);
    setShowAgencyDrop(true);
  };

  const handleBureauChange = (v: string) => {
    onBureauChange(v);
    fetchBureauSuggestions(v, agency);
    setShowBureauDrop(true);
  };

  const handleAgencySelect = (v: string) => {
    onAgencyChange(v);
    setShowAgencyDrop(false);
    setAgencySuggestions([]);
    // Refresh bureau suggestions scoped to the newly selected agency
    fetchBureauSuggestions(bureau, v);
  };

  const handleBureauSelect = (v: string) => {
    onBureauChange(v);
    setShowBureauDrop(false);
    setBureauSuggestions([]);
  };

  const handleKeyDown = (applyOnEnter: boolean) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setShowAgencyDrop(false);
        setShowBureauDrop(false);
      }
      if (e.key === 'Enter' && applyOnEnter) {
        setShowAgencyDrop(false);
        setShowBureauDrop(false);
        onApply();
      }
    };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <TypeaheadInput
        id="filter-agency"
        label="Filter by agency"
        placeholder="Agency…"
        value={agency}
        suggestions={agencySuggestions}
        showDropdown={showAgencyDrop}
        onChange={handleAgencyChange}
        onSelect={handleAgencySelect}
        onFocus={() => { fetchAgencySuggestions(agency); setShowAgencyDrop(true); }}
        onBlur={() => setTimeout(() => setShowAgencyDrop(false), 150)}
        onKeyDown={handleKeyDown(true)}
      />
      <TypeaheadInput
        id="filter-bureau"
        label="Filter by bureau or office"
        placeholder="Bureau / Office…"
        value={bureau}
        suggestions={bureauSuggestions}
        showDropdown={showBureauDrop}
        onChange={handleBureauChange}
        onSelect={handleBureauSelect}
        onFocus={() => { fetchBureauSuggestions(bureau, agency); setShowBureauDrop(true); }}
        onBlur={() => setTimeout(() => setShowBureauDrop(false), 150)}
        onKeyDown={handleKeyDown(true)}
      />
      <button
        onClick={() => { setShowAgencyDrop(false); setShowBureauDrop(false); onApply(); }}
        className="btn-primary text-xs"
      >
        Apply
      </button>
      {hasFilter && (
        <button
          onClick={() => { setAgencySuggestions([]); setBureauSuggestions([]); onClear(); }}
          className="btn-secondary text-xs"
        >
          Clear
        </button>
      )}
    </div>
  );
}
