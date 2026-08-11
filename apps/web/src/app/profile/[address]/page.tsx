import Link from 'next/link';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Card, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

export default async function AddressProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  return (
    <DaoShell>
      <PageSection
        eyebrow="Profile"
        title={address}
        description="This profile will later merge direct RPC reads with Mercury activity to show token ownership, voting power, and delegation."
      >
        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Address</Text>
              <ShortId value={address} />
              <Badge>Pending live data</Badge>
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Quick links</Text>
              <Link href={`/token/0`} style={{ color: 'inherit' }}>Token page sample</Link>
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
