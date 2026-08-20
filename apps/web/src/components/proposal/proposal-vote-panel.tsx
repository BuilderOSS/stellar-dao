import { Button, Card, Input, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

const VOTE_OPTIONS = [
  { label: 'For', value: 1 },
  { label: 'Against', value: 0 },
  { label: 'Abstain', value: 2 }
];

type CurrentVote = {
  label: string;
  reason: string;
};

type ProposalVotePanelProps = {
  canVote: boolean;
  busy: boolean;
  voteReason: string;
  selectedVoteType: number | null;
  votingPower: string | null;
  votingPowerLoading: boolean;
  votingPowerError: string;
  onVoteReasonChange: (value: string) => void;
  onSelectedVoteTypeChange: (voteType: number) => void;
  onVote: (voteType: number) => void;
  currentVote: CurrentVote | null;
};

export function ProposalVotePanel({ canVote, busy, voteReason, selectedVoteType, votingPower, votingPowerLoading, votingPowerError, onVoteReasonChange, onSelectedVoteTypeChange, onVote, currentVote }: ProposalVotePanelProps) {
  if (!canVote && !currentVote) {
    return null;
  }

  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Your vote</Text>
        {canVote ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            {votingPowerLoading
              ? 'Checking your voting power at this proposal snapshot...'
              : votingPowerError || `Voting power at snapshot: ${votingPower ?? '0'}`}
          </Text>
        ) : null}
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
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ color: 'rgba(176,201,229,0.88)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '8px' }}>Select your vote</legend>
              <div role="radiogroup" aria-label="Vote type" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {VOTE_OPTIONS.map((option) => {
                  const selected = selectedVoteType === option.value;
                  return (
                    <label
                      key={option.value}
                      style={{
                        borderRadius: '8px',
                        border: selected ? '1px solid rgba(147, 197, 253, 0.95)' : '1px solid rgba(160, 194, 225, 0.28)',
                        background: selected ? 'rgba(37, 99, 235, 0.92)' : 'transparent',
                        color: selected ? '#eff6ff' : 'inherit',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '36px',
                        padding: '0 12px',
                        opacity: busy ? 0.7 : 1
                      }}
                    >
                      <input
                        type="radio"
                        name="proposal-vote-type"
                        value={option.value}
                        checked={selected}
                        onChange={() => onSelectedVoteTypeChange(option.value)}
                        disabled={busy}
                        style={{ inlineSize: 1, blockSize: 1, opacity: 0, margin: 0, pointerEvents: 'none' }}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="button" onClick={() => selectedVoteType !== null ? onVote(selectedVoteType) : undefined} disabled={busy || selectedVoteType === null}>
                {busy ? 'Submitting...' : 'Submit vote'}
              </Button>
            </div>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
