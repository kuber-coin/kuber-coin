import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function PricePage() {
  return (
    <UnavailableFeaturePage
      title="Market pricing is not a built-in KuberCoin capability"
      summary="This route depended on an optional external price feed and browser-stored alerts. Without a configured market data source, the page did not reflect verifiable network state."
      reason="The node exposes blockchain and wallet data, not exchange pricing. If market pricing is required, it should be implemented as a clearly external integration with server-side validation and explicit provider handling."
      availableNow={[
        'Live wallet balances in native KBR units',
        'Wallet analytics derived from transaction history',
        'Explorer and ops pages backed by current node RPC data',
      ]}
    />
  );
}