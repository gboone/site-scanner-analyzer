import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { QueryResult } from 'shared';

const HISTORY_KEY = 'sql_query_history';
const MAX_HISTORY = 50;

export function useSqlQuery() {
  return useMutation<QueryResult, Error, string>({
    mutationFn: (sql: string) => api.runQuery(sql) as any,
  });
}

export function getQueryHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToHistory(sql: string) {
  const history = getQueryHistory().filter((q) => q !== sql);
  history.unshift(sql);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}
