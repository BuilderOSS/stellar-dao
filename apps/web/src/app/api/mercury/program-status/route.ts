import { NextResponse } from 'next/server';
import { getMercuryProgramStatuses } from '@/lib/mercury';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getMercuryProgramStatuses();
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Mercury status unavailable'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
