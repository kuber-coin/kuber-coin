import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function PortfolioPage() {
  return (
    <UnavailableFeaturePage
      title="Portfolio tracking is not backed by the node"
      summary="This route previously stored arbitrary token balances and prices in the browser, which looked like real portfolio state but was not connected to KuberCoin consensus or wallet data."
      reason="The current backend exposes KuberCoin wallet balances, UTXOs, transaction history, mempool, and chain state. It does not expose a token registry, contract balances, or price-validated portfolio accounting."
      availableNow={[
        'Live KuberCoin wallet balances from the active wallet',
        'UTXO inventory and transaction history',
        'Node-backed chain, mempool, and peer statistics',
      ]}
    />
  );
}