import { NextResponse } from 'next/server';
import { getMercuryAccountHistory } from '@/lib/mercury';

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
  const limit = parseLimit(url.searchParams.get('limit'), 20);
  const address = url.searchParams.get('address') ?? '';
  try {
    const payload = await getMercuryAccountHistory(address, limit);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        address,
        items: [],
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Mercury history unavailable'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
