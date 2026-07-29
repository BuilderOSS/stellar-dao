'use client';

import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import type { ActionRecord } from '@/lib/tx';
import type { NetworkName } from '@/lib/stellar';
import { Grid, Stack } from 'styled-system/jsx';

type AccountCenterProps = {
  network: NetworkName;
  address: string;
  status: string;
  history: ActionRecord[];
};

function countBy(history: ActionRecord[], predicate: (record: ActionRecord) => boolean) {
  return history.filter(predicate).length;
}

export function AccountCenter({ network, address, status, history }: AccountCenterProps) {
  const recent = history.slice(0, 5);
  const successCount = countBy(history, (record) => record.status === 'success');
  const errorCount = countBy(history, (record) => record.status === 'error');
  const uniqueActions = new Set(history.map((record) => record.actionId)).size;
  const lastAction = history[0];

  return (
    <Stack gap="5">
      <Card p="6">
        <Stack gap="3">
          <Badge>{network === 'local' ? 'Local account' : 'Testnet account'}</Badge>
          <Heading style={{ fontSize: '1.6rem' }}>Connected account</Heading>
          <Text className="lede" style={{ margin: 0 }}>
            {address ? 'Wallet connected and ready for contract reads and submissions.' : 'Connect a wallet to unlock account actions.'}
          </Text>
        </Stack>
      </Card>

      <Grid columns={{ base: 1, md: 2 }} gap="4">
        <Card p="4">
          <Stack gap="2">
            <Text className="label">Wallet</Text>
            {address ? <ShortId value={address} /> : <Text>Not connected</Text>}
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              {status}
            </Text>
          </Stack>
        </Card>
        <Card p="4">
          <Stack gap="2">
            <Text className="label">My activity</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Badge>{history.length} actions</Badge>
              <Badge>{successCount} success</Badge>
              <Badge>{errorCount} failed</Badge>
              <Badge>{uniqueActions} kinds</Badge>
            </div>
            <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
              {lastAction ? `Last: ${lastAction.actionTitle}` : 'No local activity yet.'}
            </Text>
          </Stack>
        </Card>
      </Grid>

      <Card p="5">
        <Stack gap="4">
          <Text className="label">Recent interactions</Text>
          {recent.length ? (
            <Stack gap="3">
              {recent.map((record) => (
                <Card key={record.id} p="4">
                  <Stack gap="2">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <Text style={{ margin: 0, color: 'white', fontWeight: 700 }}>{record.actionTitle}</Text>
                      <Badge>{record.status}</Badge>
                    </div>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
                      {record.summary}
                    </Text>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                      {new Date(record.timestamp).toLocaleString()}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : (
            <Text className="lede" style={{ margin: 0 }}>
              No submitted transactions yet. Use the Actions tab to build up your local activity log.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
