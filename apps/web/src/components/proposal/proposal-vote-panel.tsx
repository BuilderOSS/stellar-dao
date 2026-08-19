import { Button, Card, Input, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type CurrentVote = {
  label: string;
  reason: string;
};

type ProposalVotePanelProps = {
  canVote: boolean;
  busy: boolean;
  voteReason: string;
  onVoteReasonChange: (value: string) => void;
  onVote: (voteType: number) => void;
  currentVote: CurrentVote | null;
};

export function ProposalVotePanel({ canVote, busy, voteReason, onVoteReasonChange, onVote, currentVote }: ProposalVotePanelProps) {
  if (!canVote && !currentVote) {
    return null;
  }

  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Your vote</Text>
        {currentVote ? (
          <Card p="4">
            <Stack gap="2">
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>You already voted {currentVote.label}.</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{currentVote.reason || 'No reason provided'}</Text>
            </Stack>
          </Card>
        ) : null}

        {canVote && !currentVote ? (
          <>
            <Input value={voteReason} onChange={(event) => onVoteReasonChange(event.target.value)} placeholder="Vote reason" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Button type="button" onClick={() => onVote(1)} disabled={busy}>For</Button>
              <Button type="button" variant="outline" onClick={() => onVote(0)} disabled={busy}>Against</Button>
              <Button type="button" variant="outline" onClick={() => onVote(2)} disabled={busy}>Abstain</Button>
            </div>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
