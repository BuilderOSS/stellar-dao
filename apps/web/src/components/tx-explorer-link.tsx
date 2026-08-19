import { getExplorerTxUrl } from '@/lib/explorer-links';
import type { DaoNetworkName } from '@/lib/dao-config';

export function TxExplorerLink({ network, txHash }: { network: DaoNetworkName; txHash: string }) {
  return (
    <a href={getExplorerTxUrl(network, txHash)} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
      View tx on explorer
    </a>
  );
}
