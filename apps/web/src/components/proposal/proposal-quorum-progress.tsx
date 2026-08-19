import { Box, Stack } from 'styled-system/jsx';
import { Badge, Card, Text } from '@/components/ui';
import { proposalStateBadgeStyle } from '@/lib/proposal-state';

type ProposalQuorumProgressProps = {
  forVotes: bigint;
  quorumVotes: bigint;
  totalVotes: bigint;
};

function formatBigInt(value: bigint) {
  return value.toString();
}

function formatPercent(value: bigint, quorumVotes: bigint) {
  if (quorumVotes <= 0n) return null;
  const pct = Number((value * 100n) / quorumVotes);
  return Number.isFinite(pct) ? pct : null;
}

export function ProposalQuorumProgress({ forVotes, quorumVotes, totalVotes }: ProposalQuorumProgressProps) {
  if (totalVotes <= 0n || quorumVotes <= 0n) {
    return null;
  }

  const met = forVotes >= quorumVotes;
  const remaining = met ? 0n : quorumVotes - forVotes;
  const fillPct = met ? 100 : Math.max(0, Math.min(Number((forVotes * 100n) / quorumVotes), 100));
  const pct = formatPercent(forVotes, quorumVotes);
  const footer = `${formatBigInt(forVotes)} of ${formatBigInt(quorumVotes)} For ${quorumVotes === 1n ? 'vote' : 'votes'}`;

  return (
    <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)' }}>
      <Stack gap="3">
        <Box display="flex" justifyContent="space-between" alignItems="center" gap="3">
          <Text className="label">Quorum</Text>
          <Badge style={proposalStateBadgeStyle(met ? 'Succeeded' : 'Pending')}>
            {met ? 'Reached' : `${formatBigInt(remaining)} to go`}
          </Badge>
        </Box>

        <Box display="flex" alignItems="baseline" gap="2">
          <Text style={{ fontSize: '1.75rem', lineHeight: 1, margin: 0, fontWeight: 700 }}>{formatBigInt(forVotes)}</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.95rem' }}>/ {formatBigInt(quorumVotes)} needed</Text>
        </Box>

        {pct !== null ? <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>{pct}% of quorum</Text> : null}

        <Box
          h="3"
          borderRadius="999px"
          position="relative"
          overflow="hidden"
          style={{ background: 'rgba(243, 244, 246, 0.9)' }}
          role="img"
          aria-label={footer}
        >
          <Box
            h="100%"
            w={`${fillPct}%`}
            minW={forVotes > 0n ? '4px' : '0'}
            borderRadius="999px"
            style={{ background: 'linear-gradient(90deg, rgba(11, 105, 57, 1) 0%, rgba(22, 163, 74, 1) 100%)' }}
          />
          {!met ? (
            <Box
              aria-hidden="true"
              position="absolute"
              top="-0.75"
              left="100%"
              transform="translateX(-50%)"
              w="0.5"
              h="4.5"
              style={{ background: 'rgba(71, 85, 105, 0.95)' }}
            />
          ) : null}
        </Box>

        {!met ? (
          <Box position="relative" h="4">
            <Text className="lede" style={{ margin: 0, fontSize: '0.8rem', position: 'absolute', right: 0, whiteSpace: 'nowrap' }}>
              Quorum {formatBigInt(quorumVotes)}
            </Text>
          </Box>
        ) : null}

        <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>{footer}</Text>
      </Stack>
    </Card>
  );
}
