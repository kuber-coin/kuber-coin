import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function StakingPage() {
  return (
    <UnavailableFeaturePage
      title="Staking pools are not wired to real consensus mechanics"
      summary="This route displayed pool and reward state from a client-side service, not from a node-validated staking backend or consensus engine."
      reason="The current wallet app does not expose verified staking pool discovery, delegated balances, reward accrual, or claim flows from the KuberCoin node. Until those APIs exist, this route should remain explicit about its status."
      availableNow={[
        'Native wallet balances and spendable funds',
        'Transaction analytics based on real wallet records',
        'Chain, fork, mempool, and peer monitoring pages',
      ]}
    />
  );
}