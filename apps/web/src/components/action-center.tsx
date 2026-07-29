'use client';

import { Badge, Card, Heading, Text } from '@/components/ui';
import type { ActionRecord } from '@/lib/tx';
import { ACTION_SECTIONS } from '@/lib/tx';
import type { NetworkName } from '@/lib/stellar';
import { TransactionCard } from '@/components/transaction-card';
import { Grid, Stack } from 'styled-system/jsx';

type ActionCenterProps = {
  network: NetworkName;
  address: string;
  onRecord?: (record: ActionRecord) => void;
};

function SectionCard({ title, hint }: { title: string; hint: string }) {
  return (
    <Card p="5">
      <Stack gap="2">
        <Text className="label">{title}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
          {hint}
        </Text>
      </Stack>
    </Card>
  );
}

export function ActionCenter({ network, address, onRecord }: ActionCenterProps) {
  return (
    <Stack gap="5">
      <Card p="6">
        <Stack gap="3">
          <Badge>Arena actions</Badge>
          <Heading style={{ fontSize: '1.8rem' }}>Playbook</Heading>
          <Text className="lede" style={{ margin: 0, maxWidth: '72ch' }}>
            Build each arena move, inspect the preview, then sign and submit from the connected wallet. Multi-signer
            flows still show the full handoff payload for the extra signers.
          </Text>
        </Stack>
      </Card>

      {ACTION_SECTIONS.filter((section) => section.group !== 'admin').map((section) => (
        <Stack key={section.group} gap="4">
          <SectionCard title={section.title} hint={section.hint} />
          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            {section.actions.map((spec) => (
              <TransactionCard key={spec.id} spec={spec} network={network} address={address} onRecord={onRecord} />
            ))}
          </Grid>
        </Stack>
      ))}
    </Stack>
  );
}
