import { Button, Card, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalQueuePanelProps = {
  busy: boolean;
  onQueue: () => void;
};

export function ProposalQueuePanel({ busy, onQueue }: ProposalQueuePanelProps) {
  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Queue proposal</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
          This proposal passed. Queue it to make it eligible for execution.
        </Text>
        <Button type="button" onClick={onQueue} disabled={busy}>
          Queue proposal
        </Button>
      </Stack>
    </Card>
  );
}
