'use client';

import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import type { ActionRecord } from '@/lib/tx';
import { ACTION_SECTIONS } from '@/lib/tx';
import type { NetworkConfig, NetworkName } from '@/lib/stellar';
import { TransactionCard } from '@/components/transaction-card';
import { Grid, Stack } from 'styled-system/jsx';

type DevToolsProps = {
  network: NetworkName;
  networkConfig: NetworkConfig;
  address: string;
  status: string;
  history: ActionRecord[];
  onRecord?: (record: ActionRecord) => void;
};

export function DevTools({ network, networkConfig, address, status, history, onRecord }: DevToolsProps) {
  const adminSection = ACTION_SECTIONS.find((section) => section.group === 'admin');

  return (
    <Stack gap="5">
      <Card p="6">
        <Stack gap="3">
          <div>
            <Badge>Developer tools</Badge>
          </div>
          <Heading style={{ fontSize: '1.8rem' }}>Admin and arena diagnostics</Heading>
          <Text className="lede" style={{ margin: 0, maxWidth: '72ch' }}>
            Admin controls are intentionally separated from normal user flows. Use them here when the connected wallet
            is allowed to submit privileged operations.
          </Text>
        </Stack>
      </Card>

      <Grid columns={{ base: 1, xl: 2 }} gap="4">
        <Card p="5">
          <Stack gap="3">
            <Text className="label">Diagnostics</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Badge>{networkConfig.label}</Badge>
              <Badge>{networkConfig.rpcUrl}</Badge>
              <Badge>{status}</Badge>
            </div>
            <Text className="lede" style={{ margin: 0 }}>
              {networkConfig.contractId ? 'Contract ID loaded from environment.' : 'No contract ID configured for this network.'}
            </Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {networkConfig.contractId ? <ShortId value={networkConfig.contractId} /> : <Badge>Missing contract id</Badge>}
              <ShortId value={networkConfig.adminAddress} />
              {address ? <ShortId value={address} /> : <Badge>No wallet connected</Badge>}
            </div>
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              Admin address is configured for this network.
            </Text>
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              Local arena log contains {history.length} recorded transaction attempt{history.length === 1 ? '' : 's'}.
            </Text>
          </Stack>
        </Card>

        <Card p="5">
          <Stack gap="3">
            <Text className="label">Bootstrap notes</Text>
            <Text className="lede" style={{ margin: 0 }}>
              Use the local network to test deployment, TTL extension, admin resets, and contract configuration.
            </Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Badge>{network === 'local' ? 'Local first' : 'Testnet ready'}</Badge>
              <Badge>Admin-only forms below</Badge>
            </div>
          </Stack>
        </Card>
      </Grid>

      {adminSection ? (
        <Stack gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Admin controls</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                These calls are grouped separately and should only be used with the correct privileged wallet.
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Badge>Admin</Badge>
                <ShortId value={networkConfig.adminAddress} />
              </div>
            </Stack>
          </Card>
          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            {adminSection.actions.map((spec) => (
              <TransactionCard key={spec.id} spec={spec} network={network} address={address} onRecord={onRecord} />
            ))}
          </Grid>
        </Stack>
      ) : null}
    </Stack>
  );
}
