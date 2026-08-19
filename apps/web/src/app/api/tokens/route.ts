import { NextResponse } from 'next/server';
import { getMercuryTokenInventory } from '@/lib/mercury';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getMercuryTokenInventory();
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        totalSupply: 0,
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Token inventory unavailable'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
