import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function RebalancePage() {
  return (
    <UnavailableFeaturePage
      title="Portfolio rebalancing is not backed by real multi-asset state"
      summary="This route calculated allocations and rebalance actions from browser-local asset models rather than confirmed on-chain or exchange-held positions."
      reason="The current wallet backend manages KuberCoin wallet balances and UTXOs. It does not expose verified multi-asset holdings or execution paths needed for automated rebalancing."
      availableNow={[
        'Real KuberCoin wallet balances and UTXOs',
        'Transaction history and analytics for the active wallet',
        'Node-backed explorer and ops monitoring views',
      ]}
    />
  );
}