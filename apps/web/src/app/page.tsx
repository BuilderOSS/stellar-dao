import { WalletDemo } from '@/components/wallet-demo';

export default function Page() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Stellar Wallets Kit</p>
        <h1>Punch Counter</h1>
        <p className="lede">
          Connect a wallet, switch between local and testnet, and talk to the Soroban contract from a typed client.
        </p>
      </section>
      <WalletDemo />
    </main>
  );
}
