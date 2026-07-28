'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { createCounterClient, getDefaultNetwork, getNetworkConfig, type NetworkConfig } from '@/lib/stellar';

type NetworkName = 'local' | 'testnet';

export function WalletDemo() {
  const [network, setNetwork] = useState<NetworkName>(getDefaultNetwork());
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [totalSupply, setTotalSupply] = useState('');
  const [balance, setBalance] = useState('');
  const buttonRef = useRef<HTMLDivElement | null>(null);

  const currentNetwork: NetworkConfig = useMemo(() => getNetworkConfig(network), [network]);

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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Wallet connection failed');
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

      setStatus(`Loaded contract data from ${currentNetwork.label}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Contract lookup failed');
    }
  }

  return (
    <section className="card stack">
      <div className="field-grid">
        <div className="field">
          <label htmlFor="network">Network</label>
          <select id="network" value={network} onChange={(event) => setNetwork(event.target.value as NetworkName)}>
            <option value="local">Local</option>
            <option value="testnet">Testnet</option>
          </select>
        </div>
        <div className="field">
          <label>Wallet kit button</label>
          <div ref={buttonRef} />
        </div>
        <button type="button" onClick={connect}>
          Connect wallet
        </button>
      </div>

      <div className="stack">
        <div>
          <div className="label">Status</div>
          <div>{status}</div>
        </div>
        <div>
          <div className="label">Address</div>
          <div className="mono">{address || 'Not connected'}</div>
        </div>
        <div>
          <div className="label">RPC URL</div>
          <div className="mono">{currentNetwork.rpcUrl}</div>
        </div>
        <div>
          <div className="label">Contract ID</div>
          <div className="mono">{currentNetwork.contractId || 'Set NEXT_PUBLIC_STELLAR_*_CONTRACT_ID'}</div>
        </div>
        <button type="button" onClick={loadContractData}>
          Load contract data
        </button>
        <div>
          <div className="label">Token</div>
          <div>{tokenName || 'Unknown'} {tokenSymbol ? `(${tokenSymbol})` : ''}</div>
        </div>
        <div>
          <div className="label">Total supply</div>
          <div className="mono">{totalSupply || '0'}</div>
        </div>
        <div>
          <div className="label">Wallet balance</div>
          <div className="mono">{balance || 'Connect a wallet first'}</div>
        </div>
      </div>
    </section>
  );
}
