import { Card, Heading, ShortId, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';
import type { ProposalDetail } from './types';
import { ProposalStateBadge } from './proposal-state-badge';

type ProposalOverviewProps = {
  detail: ProposalDetail;
  now: number;
};

function formatCountdown(target: number, now: number) {
  if (!target) return '—';
  const delta = Math.max(0, target - Math.floor(now / 1000));
  const minutes = Math.floor(delta / 60);
  const seconds = delta % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function ProposalOverview({ detail, now }: ProposalOverviewProps) {
  return (
    <Card p="5">
      <Stack gap="3">
        <div>
          <ProposalStateBadge label={detail.label} />
        </div>
        <Heading style={{ fontSize: '1.35rem' }}>{detail.metadata.title}</Heading>
        <Stack gap="2">
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Proposer: {detail.proposer}</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Snapshot ledger: {detail.vote_snapshot}</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Deadline ledger: {detail.vote_end}</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Ends in: {formatCountdown(detail.vote_end, now)}</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Description: {detail.metadata.description || '—'}</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>URL: {detail.metadata.url || '—'}</Text>
          {detail.metadata.url ? (
            <a href={detail.metadata.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{detail.metadata.url}</a>
          ) : null}
        </Stack>
        <ShortId value={detail.proposalId} label="Proposal id" />
      </Stack>
    </Card>
  );
}
