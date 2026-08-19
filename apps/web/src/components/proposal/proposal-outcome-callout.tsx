import { Card, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalOutcomeCalloutProps = {
  stateLabel: string;
};

function getOutcomeCopy(stateLabel: string) {
  switch (stateLabel) {
    case 'Pending':
      return 'This proposal is pending and is not yet ready for action.';
    case 'Active':
      return 'Voting is currently open. Use the vote panel to participate.';
    case 'Defeated':
      return 'This proposal did not pass. No further action is available.';
    case 'Expired':
      return 'This proposal expired before it could be completed.';
    case 'Canceled':
      return 'This proposal was canceled and is no longer actionable.';
    case 'Executed':
      return 'This proposal has already been executed.';
    default:
      return 'This proposal is no longer actionable.';
  }
}

export function ProposalOutcomeCallout({ stateLabel }: ProposalOutcomeCalloutProps) {
  return (
    <Card p="5">
      <Stack gap="2">
        <Text className="label">Status</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{getOutcomeCopy(stateLabel)}</Text>
      </Stack>
    </Card>
  );
}
