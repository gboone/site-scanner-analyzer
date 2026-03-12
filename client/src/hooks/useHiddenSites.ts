import React from 'react';

const LS_KEY = 'site_scanner_hidden_domains';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function save(s: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...s]));
}

export function useHiddenSites() {
  const [hidden, setHidden] = React.useState<Set<string>>(load);

  const hide = React.useCallback((domains: string[]) => {
    setHidden((prev) => {
      const next = new Set(prev);
      domains.forEach((d) => next.add(d));
      save(next);
      return next;
    });
  }, []);

  const unhide = React.useCallback((domains: string[]) => {
    setHidden((prev) => {
      const next = new Set(prev);
      domains.forEach((d) => next.delete(d));
      save(next);
      return next;
    });
  }, []);

  const clearAll = React.useCallback(() => {
    setHidden(new Set());
    localStorage.removeItem(LS_KEY);
  }, []);

  return { hidden, hide, unhide, clearAll };
}
