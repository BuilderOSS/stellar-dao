import { NextResponse } from 'next/server';
import { getMercuryGovernorAuthorities } from '@/lib/mercury';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getMercuryGovernorAuthorities();
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Governor authority feed unavailable'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
