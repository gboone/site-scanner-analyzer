import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PaginatedResponse } from 'shared';

export function useScanSessions() {
  return useQuery({
    queryKey: ['scan-sessions'],
    queryFn: () => api.getScanSessions().then((r) => r.data) as any,
    staleTime: 1000 * 10, // 10 seconds — stay reasonably fresh while visible
  });
}

export function useSites(params: Record<string, string | number | boolean>) {
  return useQuery<PaginatedResponse<Record<string, unknown>>>({
    queryKey: ['sites', params],
    queryFn: () => api.getSites(params) as any,
  });
}

export function useSite(domain: string | null) {
  return useQuery({
    queryKey: ['site', domain],
    queryFn: () => api.getSite(domain!) as any,
    enabled: !!domain,
    staleTime: 5 * 60 * 1000, // 5 minutes — backed by server ETag
  });
}

export function useStats(filter?: { agency?: string; bureau?: string; domains?: string[] }) {
  return useQuery({
    queryKey: ['stats', filter],
    queryFn: () => api.getStats(filter) as any,
    staleTime: 5 * 60 * 1000, // 5 minutes — server sets Cache-Control: private, max-age=300
    retry: 1,                  // fail fast so the error state surfaces quickly
  });
}

