import { Button, Card, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalExecutePanelProps = {
  busy: boolean;
  onExecute: () => void;
};

export function ProposalExecutePanel({ busy, onExecute }: ProposalExecutePanelProps) {
  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Execute proposal</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
          This proposal is queued and ready to execute on-chain.
        </Text>
        <Button type="button" onClick={onExecute} disabled={busy}>
          Execute proposal
        </Button>
      </Stack>
    </Card>
  );
}
