import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function AtomicSwapsPage() {
  return (
    <UnavailableFeaturePage
      title="Atomic swaps are not wired to a real backend"
      summary="This route called swap endpoints that do not exist in the app and silently fell back to cached browser data. That is not a real trading workflow."
      reason="There are no implemented /api/swaps routes in the wallet web app, and the client service intentionally fabricates offers and rates when the requests fail. Until server endpoints and settlement logic exist, this route must stay explicit about its status."
      availableNow={[
        'Live KuberCoin wallet operations through the JSON-RPC-backed wallet flows',
        'Transaction history and analytics from actual wallet records',
        'Explorer verification for blocks, transactions, and addresses',
      ]}
    />
  );
}