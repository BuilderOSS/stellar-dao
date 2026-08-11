import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, Heading, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

export default function ProfileLandingPage() {
  return (
    <DaoShell>
      <PageSection
        eyebrow="Profile"
        title="Address profile"
        description="Open any address profile to see tokens, votes, delegation, and activity."
      >
        <Grid columns={{ base: 1, md: 2 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Badge>Use a route param</Badge>
              <Heading style={{ fontSize: '1.25rem' }}>Open `/profile/[address]`</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                This landing page will evolve into a search-and-redirect entry point.
              </Text>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Profile contents</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Tokens owned, voting power, delegation, proposals, and transfer history.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
