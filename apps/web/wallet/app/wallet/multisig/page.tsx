import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function MultisigPage() {
  return (
    <UnavailableFeaturePage
      title="Multisig workflows are not backed by the current wallet backend"
      summary="This route created multisig wallets and proposals in browser storage rather than using a node-validated multisignature wallet engine."
      reason="A real multisig surface needs address creation, proposal persistence, signature coordination, PSBT or equivalent transaction assembly, and execution against the node. That stack is not currently wired into this app."
      availableNow={[
        'Single-wallet send and receive flows backed by the node',
        'Wallet UTXO inspection and transaction history',
        'Explorer and ops monitoring pages driven by live RPC data',
      ]}
    />
  );
}