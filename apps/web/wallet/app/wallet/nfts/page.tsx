import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function NFTsPage() {
  return (
    <UnavailableFeaturePage
      title="NFT features are not implemented on the current chain"
      summary="This route minted and transferred browser-local NFT objects rather than assets tracked by the chain or validated by the node."
      reason="There is no NFT protocol, indexer, or wallet API in the current KuberCoin stack that can prove ownership, metadata, minting, or transfer state for non-fungible assets."
      availableNow={[
        'Native KuberCoin wallet balances and transaction history',
        'Explorer views for addresses, blocks, and transactions',
        'Node and network monitoring through ops screens',
      ]}
    />
  );
}
