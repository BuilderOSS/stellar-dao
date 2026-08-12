import useSWR from 'swr';
import type { MercuryActivityResponse, MercuryMintAuthorityResponse, MercuryProgramStatusResponse } from '@/lib/mercury-types';

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const json = (await response.json()) as T;
  if (!response.ok) {
    throw new Error((json as { message?: string }).message || 'Request failed');
  }
  return json;
}

export function useMercuryActivityFeed(limit = 8) {
  const key = `/api/mercury/activity-feed?limit=${limit}`;
  return useSWR<MercuryActivityResponse>(key, fetchJson, { keepPreviousData: true });
}

export function useMercuryProgramStatuses() {
  return useSWR<MercuryProgramStatusResponse>('/api/mercury/program-status', fetchJson, { keepPreviousData: true });
}

export function useMercuryMintAuthorities() {
  return useSWR<MercuryMintAuthorityResponse>('/api/mercury/mint-authorities', fetchJson, { keepPreviousData: true });
}
