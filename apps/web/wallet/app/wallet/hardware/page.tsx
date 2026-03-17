import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function HardwareWalletPage() {
  return (
    <UnavailableFeaturePage
      title="Hardware wallet support is not integrated with the shipped app"
      summary="This route relied on a local service abstraction that simulated device discovery and verification rather than proving end-to-end hardware wallet communication."
      reason="Real hardware wallet support requires tested USB or HID transport, device-specific signing flows, key derivation handling, and transaction verification paths that are validated against actual hardware. That integration is not complete here."
      availableNow={[
        'Software wallet management for native KuberCoin funds',
        'Transaction history and UTXO inspection for active wallets',
        'Explorer and node operations pages backed by live node data',
      ]}
    />
  );
}