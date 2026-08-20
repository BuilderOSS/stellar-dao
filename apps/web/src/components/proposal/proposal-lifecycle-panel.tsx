import type { ReactNode } from 'react';
import { Badge, Card, Heading, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

type ProposalLifecyclePanelProps = {
  badge: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
};

export function ProposalLifecyclePanel({ badge, title, description, children }: ProposalLifecyclePanelProps) {
  return (
    <Card p="5">
      <Stack gap="3">
        <div><Badge>{badge}</Badge></div>
        <Heading style={{ fontSize: '1.2rem' }}>{title}</Heading>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{description}</Text>
        {children}
      </Stack>
    </Card>
  );
}
