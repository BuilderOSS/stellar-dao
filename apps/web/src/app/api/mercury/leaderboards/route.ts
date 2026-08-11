import { NextResponse } from 'next/server';
import { getMercuryLeaderboards } from '@/lib/mercury';
import type { MercuryLeaderboardMetric } from '@/lib/mercury-types';

export const dynamic = 'force-dynamic';

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

function parsePage(value: string | null) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function parseMetric(value: string | null): MercuryLeaderboardMetric {
  if (value === 'combined' || value === 'wins' || value === 'punches' || value === 'raids' || value === 'balance') {
    return value;
  }

  return 'balance';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const metric = parseMetric(url.searchParams.get('metric'));
  const page = parsePage(url.searchParams.get('page'));
  const pageSize = parseLimit(url.searchParams.get('pageSize') ?? url.searchParams.get('limit'), 10);
  try {
    const payload = await getMercuryLeaderboards(metric, page, pageSize);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        metric,
        items: [],
        generatedAt: new Date().toISOString(),
        page,
        pageSize,
        total: 0,
        hasMore: false,
        message: error instanceof Error ? error.message : 'Mercury leaderboards unavailable'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
