import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

export default async function ProposalDetailPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposal detail"
        title={`Proposal ${proposalId}`}
        description="This page will show the exact vote window, quorum progress, payloads, and execution receipt for the selected proposal."
      >
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Badge>Pending</Badge>
              <Heading style={{ fontSize: '1.4rem' }}>Drafted and awaiting live vote data</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Proposal state tracking, vote bars, and action payloads will live here.
              </Text>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Timeline</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Created, pending, active, succeeded, executed.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
