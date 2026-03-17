import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function MobileSyncPage() {
  return (
    <UnavailableFeaturePage
      title="Mobile sync is not implemented as a real device service"
      summary="This route paired devices, generated QR codes, and sent notifications through a local client-side service rather than an authenticated sync backend."
      reason="To make mobile sync real, the app would need a server-side pairing protocol, device registration, message delivery, secure wallet state sync, and remote action validation. None of that is present in the current shipped stack."
      availableNow={[
        'Browser-based wallet management for the active wallet',
        'Node-backed explorer and operational monitoring routes',
        'Local wallet analytics derived from real transaction history',
      ]}
    />
  );
}