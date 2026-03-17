import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function PrivacyPage() {
  return (
    <UnavailableFeaturePage
      title="Advanced privacy tooling is not wired to the current node"
      summary="This route simulated Tor, CoinJoin, stealth addresses, and privacy history through a client-side service instead of verified wallet and network functionality."
      reason="Those features require concrete backend support, transaction construction rules, relay policy handling, and wallet state changes that are not exposed by the current KuberCoin app. Keeping this route explicit is more honest than presenting local toggles as working privacy infrastructure."
      availableNow={[
        'Standard on-chain wallet send and receive flows',
        'Wallet history, balances, and UTXO views',
        'Live chain, mempool, fork, and peer monitoring routes',
      ]}
    />
  );
}