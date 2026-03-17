import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function LightningPage() {
  return (
    <UnavailableFeaturePage
      title="Lightning support is not integrated with the shipped node"
      summary="This route depended on an optional Lightning API and local client services, but the current KuberCoin node and wallet flows do not expose Lightning channel or invoice management."
      reason="A real Lightning surface would need a functioning Lightning backend, authenticated server endpoints, payment state tracking, and test coverage proving interoperability. None of that is wired into the current wallet app."
      availableNow={[
        'On-chain wallet send and receive flows',
        'Wallet history and transaction detail views',
        'Explorer verification for blocks, mempool, and addresses',
      ]}
    />
  );
}