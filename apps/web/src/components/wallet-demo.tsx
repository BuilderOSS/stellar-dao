'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { createCounterClient, getNetworkConfig, type NetworkConfig, type NetworkName } from '@/lib/stellar';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

type MetricProps = {
  label: string;
  value: string;
  hint: string;
};

type WalletDemoProps = {
  network: NetworkName;
  onSessionUpdate: (patch: { address?: string; status?: string; syncedAt?: string }) => void;
};

function MetricTile({ label, value, hint }: MetricProps) {
  return (
    <Card p="4">
      <Stack gap="2">
        <Text className="label" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
          {label}
        </Text>
        <Text style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{value}</Text>
        <Text className="lede" style={{ margin: 0, fontSize: '0.88rem' }}>
          {hint}
        </Text>
      </Stack>
    </Card>
  );
}

export function WalletDemo({ network, onSessionUpdate }: WalletDemoProps) {
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [totalSupply, setTotalSupply] = useState('');
  const [balance, setBalance] = useState('');
  const buttonRef = useRef<HTMLDivElement | null>(null);

  const currentNetwork: NetworkConfig = useMemo(() => getNetworkConfig(network), [network]);
  const statusTone = status.toLowerCase().includes('loaded') || status.toLowerCase().includes('connected')
    ? 'rgba(34,197,94,0.18)'
    : status.toLowerCase().includes('failed') || status.toLowerCase().includes('error')
      ? 'rgba(248,113,113,0.18)'
      : 'rgba(124,58,237,0.18)';

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
      setAddress(result.address);
      setStatus(`Connected on ${currentNetwork.label}`);
      onSessionUpdate({ address: result.address, status: `Connected on ${currentNetwork.label}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      setStatus(message);
      onSessionUpdate({ status: message });
    }
  }

  async function loadContractData() {
    try {
      const client = createCounterClient(currentNetwork);
      if (!client) {
        setStatus('Set a contract id first');
        return;
      }

      const [nameTx, symbolTx, supplyTx] = await Promise.all([
        client.name(),
        client.symbol(),
        client.get_total_supply()
      ]);

      setTokenName(nameTx.result);
      setTokenSymbol(symbolTx.result);
      setTotalSupply(supplyTx.result.toString());

      if (address) {
        const balanceTx = await client.balance({ id: address });
        setBalance(balanceTx.result.toString());
      }

      const syncedAt = new Date().toISOString();
      setStatus(`Loaded contract data from ${currentNetwork.label}`);
      onSessionUpdate({ status: `Loaded contract data from ${currentNetwork.label}`, syncedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Contract lookup failed';
      setStatus(message);
      onSessionUpdate({ status: message });
    }
  }

  return (
    <Card className="stack">
      <Stack gap="6">
        <Stack gap="1">
          <Text className="label">Wallet session</Text>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Badge>{currentNetwork.label}</Badge>
            <Badge style={{ background: statusTone, color: 'white', borderColor: 'rgba(255,255,255,0.12)' }}>{status}</Badge>
          </div>
        </Stack>

        <Grid columns={{ base: 1, lg: 2 }} gap="5">
          <Stack gap="4">
            <Field>
              <FieldLabel>Active network</FieldLabel>
              <Badge>{currentNetwork.label}</Badge>
              <FieldHelperText>Use the dashboard header to switch between networks.</FieldHelperText>
            </Field>

            <Field>
              <FieldLabel>Wallet kit button</FieldLabel>
              <div ref={buttonRef} className="wallet-kit-button" />
            </Field>

            <Button type="button" size="lg" onClick={connect}>
              Connect wallet
            </Button>
          </Stack>

          <Stack gap="4">
            <MetricTile
              label="Address"
              value={address || 'Not connected'}
              hint="The wallet address returned by Stellar Wallets Kit."
            />
            <MetricTile
              label="RPC"
              value={currentNetwork.rpcUrl}
              hint="Where the Soroban client is reading and writing."
            />
            <MetricTile
              label="Contract ID"
              value={currentNetwork.contractId || 'Missing'}
              hint="Set by `pnpm local:up` or testnet deployment."
            />
          </Stack>
        </Grid>

        <Button type="button" size="lg" variant="surface" onClick={loadContractData}>
          Load contract data
        </Button>

        <Grid columns={{ base: 1, md: 3 }} gap="4">
          <MetricTile
            label="Token"
            value={tokenName || 'Unknown'}
            hint={tokenSymbol ? `Symbol ${tokenSymbol}` : 'Load the contract to read token metadata.'}
          />
          <MetricTile
            label="Total supply"
            value={totalSupply || '0'}
            hint="Current on-chain supply for the active network."
          />
          <MetricTile
            label="Wallet balance"
            value={balance || '0'}
            hint={address ? 'Balance for the connected wallet.' : 'Connect a wallet first.'}
          />
        </Grid>
      </Stack>
    </Card>
  );
}
