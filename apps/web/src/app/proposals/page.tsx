import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

export default function ProposalsPage() {
  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposals"
        title="Governance workspace"
        description="Browse pending and active proposals, review execution payloads, and follow the state of every vote from submission to execution."
      >
        <Grid columns={{ base: 1, lg: 3 }} gap="4">
          {[
            { label: 'Pending', hint: 'Queued for vote window' },
            { label: 'Active', hint: 'Open for voting' },
            { label: 'Executed', hint: 'Completed proposals' }
          ].map((item) => (
            <Card key={item.label} p="5">
              <Stack gap="2">
                <Badge>{item.label}</Badge>
                <Heading style={{ fontSize: '1.25rem' }}>No proposals loaded yet</Heading>
                <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>{item.hint}</Text>
              </Stack>
            </Card>
          ))}
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
