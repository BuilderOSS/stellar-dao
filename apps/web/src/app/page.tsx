import { WalletDemo } from '@/components/wallet-demo';
import { Badge, Card, Heading, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

export default function Page() {
  return (
    <main className="page-shell">
      <Grid columns={{ base: 1, lg: 2 }} gap="6">
        <Card p="8">
          <Stack gap="5">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge>Park UI</Badge>
              <Badge>Stellar Wallets Kit</Badge>
              <Badge>Soroban</Badge>
            </div>
            <Heading>Punch Counter</Heading>
            <Text className="lede">
              A polished frontend for the Soroban token contract, with typed clients, wallet signing, and local or
              testnet deployment.
            </Text>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge>Typed bindings</Badge>
              <Badge>Local network</Badge>
              <Badge>Testnet ready</Badge>
            </div>
          </Stack>
        </Card>

        <Card p="8">
          <Stack gap="4">
            <Text className="label">Workflow</Text>
            <Stack gap="3">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Badge>1</Badge>
                <Text>Start the local Stellar container or switch to testnet.</Text>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Badge>2</Badge>
                <Text>Connect a wallet through Stellar Wallets Kit.</Text>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Badge>3</Badge>
                <Text>Load the contract metadata and token state from the typed client.</Text>
              </div>
            </Stack>
          </Stack>
        </Card>
      </Grid>
      <WalletDemo />
    </main>
  );
}
