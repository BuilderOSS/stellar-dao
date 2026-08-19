import { NextResponse } from 'next/server';
import { getMercuryProposalVotes } from '@/lib/mercury';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await context.params;

  try {
    const payload = await getMercuryProposalVotes(proposalId);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Proposal votes unavailable'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
