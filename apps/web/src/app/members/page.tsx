import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

export default function MembersPage() {
  return (
    <DaoShell>
      <PageSection
        eyebrow="Members"
        title="Voting power directory"
        description="A ranked view of token holders and delegates, built for quick governance inspection."
      >
        <Grid columns={{ base: 1, md: 2 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Badge>Empty state</Badge>
              <Heading style={{ fontSize: '1.25rem' }}>No indexed member rows yet</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                The live member directory will come from the DAO Mercury read model.
              </Text>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Directory behavior</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Searchable addresses, voting power, delegate, and profile links.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
