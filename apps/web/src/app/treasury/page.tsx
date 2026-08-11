import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { Grid, Stack } from 'styled-system/jsx';

export default function TreasuryPage() {
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());

  return (
    <DaoShell>
      <PageSection
        eyebrow="Treasury"
        title="Execution boundary"
        description="The treasury is where approved governance actions become real contract calls."
      >
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Treasury address</Text>
              {config.treasuryContractId ? <ShortId value={config.treasuryContractId} /> : <Text>Missing</Text>}
              <Badge>Governor-authorized only</Badge>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Heading style={{ fontSize: '1.2rem' }}>Recent executions</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Treasury execution history will appear here once the Mercury-backed read model is wired.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
