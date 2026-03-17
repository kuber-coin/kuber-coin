import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function DeFiPage() {
  return (
    <UnavailableFeaturePage
      title="DeFi workflows are not implemented in KuberCoin"
      summary="This route previously simulated lending, borrowing, and liquidity positions in browser storage. That made the UI look complete while no on-chain or server-side protocol existed behind it."
      reason="There are no node RPC methods, wallet APIs, or verified smart-contract integrations for DeFi positions in this repository. Presenting local mock balances as live protocol state would be misleading."
      availableNow={[
        'Wallet send and receive flows backed by the node',
        'Wallet analytics derived from real transaction history',
        'Explorer pages for chain, mempool, peer, and address data',
      ]}
    />
  );
}