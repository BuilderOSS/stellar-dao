import useSWR from 'swr';
import type {
  MercuryAccountHistoryResponse,
  MercuryActivityResponse,
  MercuryLeaderboardMetric,
  MercuryLeaderboardResponse
} from '@/lib/mercury-types';

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

export function useMercuryAccountHistory(address: string, limit = 8) {
  const key = address ? `/api/mercury/account-history?address=${encodeURIComponent(address)}&limit=${limit}` : null;
  return useSWR<MercuryAccountHistoryResponse>(key, fetchJson, { keepPreviousData: true });
}

export function useMercuryLeaderboards(metric: MercuryLeaderboardMetric = 'balance', limit = 8) {
  const key = `/api/mercury/leaderboards?metric=${metric}&limit=${limit}`;
  return useSWR<MercuryLeaderboardResponse>(key, fetchJson, { keepPreviousData: true });
}
