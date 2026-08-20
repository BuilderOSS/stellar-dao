import { Button, Card, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalExecutePanelProps = {
  busy: boolean;
  now: number;
  eta: number;
  onExecute: () => void;
};

export function ProposalExecutePanel({ busy, now, eta, onExecute }: ProposalExecutePanelProps) {
  const ready = now >= eta * 1000;

  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Execute proposal</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
          {ready ? 'This proposal is queued and ready to execute on-chain.' : 'This proposal is queued and will become executable when the ETA in the overview is reached.'}
        </Text>
        {ready ? (
          <Button type="button" onClick={onExecute} disabled={busy}>
            Execute proposal
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
