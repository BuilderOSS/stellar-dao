import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { Grid, Stack } from 'styled-system/jsx';

export default function Page() {
  const network = getDefaultDaoNetwork();
  const config = getDaoNetworkConfig(network);

  return (
    <DaoShell>
      <PageSection
        eyebrow="Dashboard"
        title="Governance at a glance"
        description="Track the current network, contract status, and the most important DAO actions from one clean home screen."
      >
        <Grid columns={{ base: 1, md: 2, xl: 4 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Network</Text>
              <Heading style={{ fontSize: '1.6rem' }}>{config.label}</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>{config.rpcUrl}</Text>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Token</Text>
              {config.tokenContractId ? <ShortId value={config.tokenContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Governor</Text>
              {config.governorContractId ? <ShortId value={config.governorContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Treasury</Text>
              {config.treasuryContractId ? <ShortId value={config.treasuryContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
        </Grid>

        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="3">
              <Text className="label">Next actions</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Badge>Connect wallet</Badge>
                <Badge>Open proposals</Badge>
                <Badge>Check your profile</Badge>
                <Badge>Inspect treasury</Badge>
              </div>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="3">
              <Text className="label">Admin</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Minting is gated to the configured admin address.
              </Text>
              <ShortId value={config.adminAddress} />
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
