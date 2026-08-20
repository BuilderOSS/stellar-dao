import { Card, Heading, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';
import type { ProposalDetail } from './types';
import { ProposalStateBadge } from './proposal-state-badge';
import { ProposalState } from '@/lib/proposal-state';
import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerLedgerUrl } from '@/lib/explorer-links';

type ProposalOverviewProps = {
  detail: ProposalDetail;
  now: number;
  network: DaoNetworkName;
};

function formatCountdown(target: number, now: number) {
  if (!target) return '—';
  const delta = Math.max(0, target - Math.floor(now / 1000));
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  const seconds = delta % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatDateTime(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000));
  } catch {
    return String(timestamp);
  }
}

function hasValidTimestamp(value: number) {
  return Number.isFinite(value) && value > 0;
}

function getTimeline(detail: ProposalDetail, now: number) {
  switch (detail.state) {
    case ProposalState.Pending:
      const startTime = hasValidTimestamp(detail.vote_start) ? detail.vote_start : detail.vote_end;
      return {
        eyebrow: 'Voting starts',
        headline: hasValidTimestamp(startTime) ? `Voting starts in ${formatCountdown(startTime, now)}` : 'Voting has not started yet',
        subline: hasValidTimestamp(startTime) ? `Opens ${formatDateTime(startTime)}` : 'Waiting for the voting schedule to become available.'
      };
    case ProposalState.Active:
      return {
        eyebrow: 'Voting ends',
        headline: hasValidTimestamp(detail.vote_end) ? `Voting ends in ${formatCountdown(detail.vote_end, now)}` : 'Voting is active',
        subline: hasValidTimestamp(detail.vote_end) ? `Closes ${formatDateTime(detail.vote_end)}` : 'Voting end time is not available.'
      };
    case ProposalState.Succeeded:
      return {
        eyebrow: 'Ready to queue',
        headline: `Voting ended ${formatDateTime(detail.vote_end)}`,
        subline: 'This proposal can now be queued for execution.'
      };
    case ProposalState.Queued:
      if (hasValidTimestamp(detail.eta) && detail.eta > Math.floor(now / 1000)) {
        return {
          eyebrow: 'Execution scheduled',
          headline: `Executable in ${formatCountdown(detail.eta, now)}`,
          subline: `ETA ${formatDateTime(detail.eta)}`
        };
      }

      return {
        eyebrow: 'Ready to execute',
        headline: 'Ready to execute now',
        subline: detail.eta ? `ETA was ${formatDateTime(detail.eta)}` : 'The queued proposal can now be executed.'
      };
    case ProposalState.Defeated:
    case ProposalState.Canceled:
    case ProposalState.Expired:
    case ProposalState.Executed:
      return {
        eyebrow: 'Finalized',
        headline: `${detail.label} at ${formatDateTime(detail.deadline || detail.vote_end)}`,
        subline: 'No further action is available.'
      };
    default:
      return {
        eyebrow: 'Timeline',
        headline: 'Not available',
        subline: 'Timeline information is unavailable.'
      };
  }
}

export function ProposalOverview({ detail, now, network }: ProposalOverviewProps) {
  const timeline = getTimeline(detail, now);

  return (
    <Card p="5">
      <Stack gap="3">
        <div>
          <ProposalStateBadge label={detail.label} />
        </div>
        <Card p="4" style={{ background: 'rgba(157, 179, 203, 0.08)', border: '1px solid rgba(157, 179, 203, 0.18)' }}>
          <Stack gap="1">
            <Text className="label">{timeline.eyebrow}</Text>
            <Heading style={{ fontSize: '1.5rem' }}>{timeline.headline}</Heading>
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{timeline.subline}</Text>
          </Stack>
        </Card>
        <Heading style={{ fontSize: '1.35rem' }}>{detail.metadata.title}</Heading>
        <Grid columns={{ base: 1, md: 2 }} gap="3">
          <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)' }}>
            <Stack gap="1">
              <Text className="label">Snapshot</Text>
              <a href={getExplorerLedgerUrl(network, detail.vote_snapshot)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>Ledger #{detail.vote_snapshot}</Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>Open in Stellar Expert</Text>
              </a>
            </Stack>
          </Card>
          <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)' }}>
            <Stack gap="1">
              <Text className="label">Proposer</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>{detail.proposer}</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>Snapshot ledger #{detail.vote_snapshot}</Text>
            </Stack>
          </Card>
        </Grid>
        <Stack gap="2">
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
