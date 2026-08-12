import { NextResponse } from 'next/server';
import { getMercuryActivityFeed } from '@/lib/mercury';

export const dynamic = 'force-dynamic';

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit') ?? url.searchParams.get('pageSize'), 8);

  try {
    const payload = await getMercuryActivityFeed(limit);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Mercury feed unavailable'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
