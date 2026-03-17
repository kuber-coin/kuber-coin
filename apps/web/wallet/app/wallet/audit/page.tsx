import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function AuditPage() {
  return (
    <UnavailableFeaturePage
      title="Security audit logging is not connected to a durable backend"
      summary="This route relied on a client-side audit log service and local sample events rather than a persistent server-side audit trail."
      reason="A real audit surface requires durable event ingestion, retention policy, export guarantees, and trusted event sources from wallet and node activity. Browser-local event lists do not meet that bar."
      availableNow={[
        'Derived node alerts in /ops/alerts',
        'Live node and chain monitoring pages',
        'Wallet history and current local backup or import-export utilities',
      ]}
    />
  );
}