import { Card, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalVoteSummaryProps = {
  forCount: number;
  againstCount: number;
  abstainCount: number;
};

export function ProposalVoteSummary({ forCount, againstCount, abstainCount }: ProposalVoteSummaryProps) {
  return (
    <Card p="5">
      <Stack gap="2">
        <Text className="label">Vote summary</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>For {forCount} | Against {againstCount} | Abstain {abstainCount}</Text>
      </Stack>
    </Card>
  );
}
