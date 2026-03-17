import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function ColdStoragePage() {
  return (
    <UnavailableFeaturePage
      title="Cold storage workflows are not implemented as verified offline signing"
      summary="This route simulated cold wallets, unsigned transactions, mnemonics, and paper wallets through a client-side service instead of a hardened offline-signing flow."
      reason="A real cold-storage feature needs deterministic offline key handling, unsigned transaction export, signature import, and node validation for broadcast. The current wallet app does not provide that full chain of custody."
      availableNow={[
        'Standard wallet management and transaction history',
        'UTXO inspection and transaction builder routes',
        'Explorer verification for chain and transaction state',
      ]}
    />
  );
}