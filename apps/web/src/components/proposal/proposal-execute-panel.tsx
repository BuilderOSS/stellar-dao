import { Button, Card, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalExecutePanelProps = {
  busy: boolean;
  now: number;
  eta: number;
  onExecute: () => void;
};

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m ${seconds}s remaining`;
  return `${seconds}s remaining`;
}

export function ProposalExecutePanel({ busy, now, eta, onExecute }: ProposalExecutePanelProps) {
  const ready = now >= eta * 1000;
  const countdown = ready ? 'Ready to execute now.' : formatCountdown(eta * 1000 - now);

  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Execute proposal</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
          {ready ? 'This proposal is queued and ready to execute on-chain.' : `Queued. ${countdown}`}
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
