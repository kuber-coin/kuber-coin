import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function KeyManagerPage() {
  return (
    <UnavailableFeaturePage
      title="Advanced key management is not wired to a real backend"
      summary="This route advertised HD wallet generation, mnemonic import, and hybrid-signature key workflows, but the UI itself already falls back to alert messages instead of real key-management operations."
      reason="If these capabilities are meant to ship, they need verified key derivation, secure storage, import and export paths, and full end-to-end tests. The current implementation does not provide that."
      availableNow={[
        'Wallet creation and import through the supported wallet management flows',
        'Address and UTXO inspection for active wallets',
        'Live wallet analytics and node-backed explorer views',
      ]}
    />
  );
}