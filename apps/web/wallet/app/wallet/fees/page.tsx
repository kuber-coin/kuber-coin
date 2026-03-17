'use client';

import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function FeeManagerPage() {
  return (
    <UnavailableFeaturePage
      title="Fee market analytics are not shipped"
      summary="This wallet does not have a real fee-estimation backend or historical fee market feed."
      reason="The previous page generated random mempool and fee-rate values in the browser, which made the product look live when it was not."
      availableNow={[
        'Use the send flow to build and broadcast real transactions against the connected node.',
        'Wallet transaction creation still uses the node\'s RPC fee estimation when available.',
        'Use the live network and mempool views for actual node status instead of synthetic fee dashboards.',
      ]}
    />
  );
}
