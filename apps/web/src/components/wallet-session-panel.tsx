'use client';

import { useEffect, useRef } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Text } from '@/components/ui';
import type { NetworkName } from '@/lib/stellar';
import { getNetworkConfig } from '@/lib/stellar';
import { Stack } from 'styled-system/jsx';

type WalletSessionPanelProps = {
  network: NetworkName;
  address: string;
  onSessionUpdate: (patch: { address?: string; status?: string; syncedAt?: string }) => void;
};

export function WalletSessionPanel({ network, address, onSessionUpdate }: WalletSessionPanelProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const currentNetwork = getNetworkConfig(network);

  useEffect(() => {
    StellarWalletsKit.init({ modules: defaultModules() });
  }, []);

  useEffect(() => {
    const onStateUpdated = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      const nextAddress = event.payload.address ?? '';
      console.debug('[wallet-session-panel] kit state updated', event.payload);
      onSessionUpdate({
        address: nextAddress,
        status: nextAddress ? `Connected on ${currentNetwork.label}` : 'Disconnected'
      });
    });

    const onDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      console.debug('[wallet-session-panel] kit disconnected');
      onSessionUpdate({ address: '', status: 'Disconnected', syncedAt: '' });
    });

    return () => {
      onStateUpdated();
      onDisconnect();
    };
  }, [currentNetwork.label, onSessionUpdate]);

  useEffect(() => {
    if (!buttonRef.current) return;

    buttonRef.current.replaceChildren();
    if (!address) {
      void StellarWalletsKit.createButton(buttonRef.current);
    }
  }, [network, address]);

  async function connect() {
    try {
      const result = await StellarWalletsKit.authModal();
      console.debug('[wallet-session-panel] auth modal connected', result.address);
      onSessionUpdate({ address: result.address, status: `Connected on ${currentNetwork.label}` });
    } catch (error) {
      console.error('[wallet-session-panel] wallet connect failed', error);
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      onSessionUpdate({ status: message });
    }
  }

  async function disconnect() {
    try {
      console.debug('[wallet-session-panel] disconnect requested');
      await StellarWalletsKit.disconnect();
    } finally {
      onSessionUpdate({ address: '', status: 'Disconnected', syncedAt: '' });
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
          <Text className="label">Wallet session</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
            {address
              ? 'Wallet connected. You can disconnect it here or switch wallets with the kit launcher.'
              : 'Connect a wallet, then the account tab will show live contract reads for that address.'}
          </Text>
        </Stack>

        {!address ? (
          <Field>
            <FieldLabel>Wallet kit button</FieldLabel>
            <div ref={buttonRef} className="wallet-kit-button" />
            <FieldHelperText>Use the kit button or the manual connect button below.</FieldHelperText>
          </Field>
        ) : (
          <Field>
            <FieldLabel>Wallet kit button</FieldLabel>
            <FieldHelperText>Wallet already connected. Disconnect below to show the kit launcher again.</FieldHelperText>
          </Field>
        )}

        <Button type="button" size="lg" onClick={address ? disconnect : connect}>
          {address ? 'Disconnect wallet' : 'Connect wallet'}
        </Button>
      </Stack>
    </Card>
  );
}
