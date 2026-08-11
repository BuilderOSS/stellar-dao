'use client';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';

export default function AdminPage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const isAdmin = session.address && session.address === config.adminAddress;

  return (
    <DaoShell>
      <PageSection
        eyebrow="Admin"
        title="Mint voting tokens"
        description="Bootstrap page for the configured admin address. This page is only useful when the connected wallet matches the DAO admin."
      >
        {!isAdmin ? (
          <Card p="5">
            <Stack gap="2">
              <Badge>Access restricted</Badge>
              <Heading style={{ fontSize: '1.3rem' }}>Connect the admin wallet to continue</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Admin actions are hidden until the connected address matches the configured bootstrap admin.
              </Text>
              <ShortId value={config.adminAddress} label="Admin address" />
            </Stack>
          </Card>
        ) : (
          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <Card p="5">
              <Stack gap="3">
                <Badge>Admin only</Badge>
                <Heading style={{ fontSize: '1.3rem' }}>Mint form</Heading>
                <Input placeholder="Recipient address" />
                <Input placeholder="Token id" />
                <Input placeholder="Base URI" />
              </Stack>
            </Card>
            <Card p="5">
              <Stack gap="2">
                <Text className="label">What this page will do</Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Verify the connected wallet against the admin address, then submit mint transactions and show receipts.
                </Text>
              </Stack>
            </Card>
          </Grid>
        )}
      </PageSection>
    </DaoShell>
  );
}
