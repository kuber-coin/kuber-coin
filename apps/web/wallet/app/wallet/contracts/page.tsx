import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function ContractsPage() {
  return (
    <UnavailableFeaturePage
      title="Smart contract interaction is not supported by the current backend"
      summary="This route stored contract metadata locally and simulated read and write calls without a contract-enabled runtime behind the wallet."
      reason="The repository does not currently expose a verified smart-contract execution model or wallet-to-contract interaction API. Presenting local ABI storage as working contract support would be misleading."
      availableNow={[
        'Wallet management for native KuberCoin funds',
        'Explorer inspection of transactions and addresses',
        'Operational monitoring of node, forks, and mempool state',
      ]}
    />
  );
}