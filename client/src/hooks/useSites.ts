import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PaginatedResponse } from 'shared';

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
  });
}

export function useStats(filter?: { agency?: string; bureau?: string }) {
  return useQuery({
    queryKey: ['stats', filter],
    queryFn: () => api.getStats(filter) as any,
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sites: unknown[]) => api.importSites(sites) as any,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
