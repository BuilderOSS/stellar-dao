import { Button, Card, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalLifecycleActionProps = {
  title: string;
  body: string;
  buttonLabel: string;
  onAction: () => void;
  busy: boolean;
};

export function ProposalLifecycleAction({ title, body, buttonLabel, onAction, busy }: ProposalLifecycleActionProps) {
  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Next step</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{title}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{body}</Text>
        <Button type="button" onClick={onAction} disabled={busy}>{buttonLabel}</Button>
      </Stack>
    </Card>
  );
}
