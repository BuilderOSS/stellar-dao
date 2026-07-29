'use client';

import { useEffect, useRef } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Text } from '@/components/ui';
import type { NetworkName } from '@/lib/stellar';
import { getNetworkConfig } from '@/lib/stellar';
import { Stack } from 'styled-system/jsx';

type WalletDemoProps = {
  network: NetworkName;
  onSessionUpdate: (patch: { address?: string; status?: string; syncedAt?: string }) => void;
};

export function WalletDemo({ network, onSessionUpdate }: WalletDemoProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const currentNetwork = getNetworkConfig(network);

  useEffect(() => {
    StellarWalletsKit.init({ modules: defaultModules() });
  }, []);

  useEffect(() => {
    if (!buttonRef.current) return;
    buttonRef.current.replaceChildren();
    StellarWalletsKit.createButton(buttonRef.current);
  }, [network]);

  async function connect() {
    try {
      const result = await StellarWalletsKit.getAddress();
      onSessionUpdate({ address: result.address, status: `Connected on ${currentNetwork.label}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      onSessionUpdate({ status: message });
    }
  }

  return (
    <Card className="stack">
      <Stack gap="5">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Badge>{currentNetwork.label}</Badge>
          <Badge>Wallet session</Badge>
        </div>

        <Stack gap="2">
          <Text className="label">Wallet connect</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
            Connect a wallet, then the account tab will show live contract reads for that address.
          </Text>
        </Stack>

        <Field>
          <FieldLabel>Wallet kit button</FieldLabel>
          <div ref={buttonRef} className="wallet-kit-button" />
          <FieldHelperText>Use the kit button or the manual connect button below.</FieldHelperText>
        </Field>

        <Button type="button" size="lg" onClick={connect}>
          Connect wallet
        </Button>
      </Stack>
    </Card>
  );
}
